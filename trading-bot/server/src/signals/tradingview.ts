import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { bus } from '../feed/bus.js';
import { processCandidate } from '../engine/pipeline.js';
import type { Candidate, OrderSide } from '../types.js';

const alertSchema = z.object({
  secret: z.string().optional(),
  symbol: z.string().min(1),
  action: z.string().optional(), // buy | sell | long | short | ...
  side: z.string().optional(),
  condition: z.string().optional(),
  price: z.number().optional(),
});

function normalizeSide(raw?: string): OrderSide | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (['buy', 'long', 'bull', 'enter_long'].includes(v)) return 'buy';
  if (['sell', 'short', 'bear', 'exit', 'close', 'exit_long'].includes(v)) return 'sell';
  return null;
}

export const tradingViewRouter = Router();

/**
 * POST /webhooks/tradingview
 * Accepts a TradingView Pro+ alert. Verifies a shared secret, maps the alert to
 * a candidate, and routes it through the decision engine. A raw alert is never
 * traded directly.
 */
tradingViewRouter.post('/tradingview', async (req, res) => {
  const provided = req.header('X-Webhook-Secret') ?? (req.body && (req.body as { secret?: string }).secret);

  if (!config.tradingViewSecret) {
    bus.emitEvent('error', 'TradingView webhook received but TRADINGVIEW_WEBHOOK_SECRET is not set; rejecting.');
    return res.status(503).json({ ok: false, error: 'Webhook secret not configured.' });
  }
  if (provided !== config.tradingViewSecret) {
    bus.emitEvent('webhook', 'Rejected TradingView alert: bad secret.', { ip: req.ip });
    return res.status(401).json({ ok: false, error: 'Invalid secret.' });
  }

  const parsed = alertSchema.safeParse(req.body);
  if (!parsed.success) {
    bus.emitEvent('webhook', 'Rejected TradingView alert: invalid payload.', { issues: parsed.error.issues });
    return res.status(400).json({ ok: false, error: 'Invalid payload.', issues: parsed.error.issues });
  }

  const a = parsed.data;
  const side = normalizeSide(a.action ?? a.side);
  if (!side) {
    bus.emitEvent('webhook', `Rejected TradingView alert for ${a.symbol}: unknown action "${a.action ?? a.side}".`);
    return res.status(400).json({ ok: false, error: 'Could not determine buy/sell from action.' });
  }

  const candidate: Candidate = {
    id: randomUUID(),
    source: 'tradingview',
    symbol: a.symbol.toUpperCase(),
    side,
    condition: a.condition,
    raw: a,
    createdAt: new Date().toISOString(),
  };

  bus.emitEvent('webhook', `TradingView alert accepted: ${side.toUpperCase()} ${candidate.symbol}`, candidate);

  // Acknowledge immediately; process asynchronously so TradingView doesn't time out.
  res.json({ ok: true, candidateId: candidate.id });
  void processCandidate(candidate);
});
