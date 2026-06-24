import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { state, publicState, setAdapter, setPaused } from '../state.js';
import { activeAdapter } from '../brokers/index.js';
import { bus } from '../feed/bus.js';
import { marketStatus } from '../marketHours.js';
import { processCandidate } from '../engine/pipeline.js';
import { getNews } from '../signals/newsStore.js';
import { DecisionLog, OrderLog } from '../db/models.js';
import { isMongoConnected } from '../db/mongo.js';
import type { AdapterKind } from '../types.js';

export const apiRouter = Router();

/** Top status bar payload. */
apiRouter.get('/state', async (_req, res) => {
  const market = marketStatus();
  let portfolioValue = 0;
  try {
    portfolioValue = (await activeAdapter().getAccount()).equity;
  } catch {
    /* adapter may be unconfigured (e.g. LIVE/PAPER without creds) */
  }
  res.json({ ...publicState(), market, portfolioValue, mongo: isMongoConnected() });
});

apiRouter.get('/account', async (_req, res) => {
  try {
    res.json(await activeAdapter().getAccount());
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.get('/positions', async (_req, res) => {
  try {
    res.json(await activeAdapter().getPositions());
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.get('/activity', async (_req, res) => {
  try {
    res.json(await activeAdapter().getActivity());
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

/** Recent headlines collected by the sentinel. */
apiRouter.get('/news', (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
  res.json(getNews({ limit, symbol }));
});

/** Trade journal — decision logs with full reasoning. */
apiRouter.get('/journal', async (req, res) => {
  if (!isMongoConnected()) return res.json([]);
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const docs = await DecisionLog.find().sort({ at: -1 }).limit(limit).lean();
  res.json(docs);
});

/** Overview metrics + outcome analytics. */
apiRouter.get('/metrics', async (_req, res) => {
  const base = { decisions: 0, routed: 0, held: 0, rejected: 0, byOutcome: {} as Record<string, number>, orders: 0 };
  if (isMongoConnected()) {
    const grouped = await DecisionLog.aggregate([{ $group: { _id: '$outcome', n: { $sum: 1 } } }]);
    for (const g of grouped) {
      base.byOutcome[g._id] = g.n;
      base.decisions += g.n;
      if (g._id === 'routed') base.routed += g.n;
      else if (g._id === 'held') base.held += g.n;
      else base.rejected += g.n;
    }
    base.orders = await OrderLog.countDocuments();
  }
  let account = null;
  try {
    account = await activeAdapter().getAccount();
  } catch {
    /* ignore */
  }
  res.json({ ...base, account });
});

// --- Settings / runtime controls ---

apiRouter.post('/pause', (req, res) => {
  const paused = Boolean((req.body as { paused?: boolean }).paused);
  setPaused(paused);
  res.json({ ok: true, ...publicState() });
});

apiRouter.post('/adapter', (req, res) => {
  const kind = String((req.body as { adapter?: string }).adapter ?? '').toUpperCase() as AdapterKind;
  if (!['SIM', 'PAPER', 'LIVE'].includes(kind)) {
    return res.status(400).json({ ok: false, error: 'adapter must be SIM, PAPER or LIVE.' });
  }
  setAdapter(kind);
  res.json({ ok: true, ...publicState() });
});

const riskSchema = z.object({
  maxExposurePct: z.number().min(0).max(1).optional(),
  maxTradePct: z.number().min(0).max(1).optional(),
  dailyLossLimitPct: z.number().min(0).max(1).optional(),
  convictionThreshold: z.number().min(0).max(1).optional(),
  tradeCooldownMs: z.number().min(0).optional(),
});

apiRouter.post('/risk', (req, res) => {
  const parsed = riskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, issues: parsed.error.issues });
  Object.assign(state.risk, parsed.data);
  bus.emitEvent('state', 'Risk settings updated.', state.risk);
  res.json({ ok: true, ...publicState() });
});

apiRouter.post('/watchlist', (req, res) => {
  const list = (req.body as { watchlist?: string[] }).watchlist;
  if (!Array.isArray(list)) return res.status(400).json({ ok: false, error: 'watchlist must be an array.' });
  state.watchlist = list.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  bus.emitEvent('state', 'Watchlist updated.', state.watchlist);
  res.json({ ok: true, ...publicState() });
});

/** Manually inject a candidate (handy for testing the pipeline from the UI). */
const candidateSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  condition: z.string().optional(),
});
apiRouter.post('/candidate', (req, res) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, issues: parsed.error.issues });
  const c = parsed.data;
  const candidate = {
    id: randomUUID(),
    source: 'sentinel' as const,
    symbol: c.symbol.toUpperCase(),
    side: c.side,
    condition: c.condition ?? 'Manual test candidate',
    createdAt: new Date().toISOString(),
  };
  res.json({ ok: true, candidateId: candidate.id });
  void processCandidate(candidate);
});

/** Server-Sent Events live feed. */
apiRouter.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const onEvent = (evt: unknown) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  bus.on('event', onEvent);

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepalive);
    bus.off('event', onEvent);
  });
});
