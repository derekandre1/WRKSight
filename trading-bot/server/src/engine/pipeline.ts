import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import { activeAdapter } from '../brokers/index.js';
import { decide } from '../decision/engine.js';
import { evaluateRisk, recordTrade } from '../risk/riskGate.js';
import { DecisionLog, OrderLog } from '../db/models.js';
import { isMongoConnected } from '../db/mongo.js';
import type { Candidate, OrderPreview } from '../types.js';

/**
 * Route a candidate through the full pipeline:
 *   decision (Claude) -> risk gate -> [live preview] -> order
 * Every outcome (routed, held, rejected, error) is logged with reasoning and a
 * market snapshot. Holds and rejects are logged too — silence is a bug.
 */
export async function processCandidate(candidate: Candidate): Promise<void> {
  const adapter = activeAdapter();
  bus.emitEvent('candidate', `Candidate ${candidate.side.toUpperCase()} ${candidate.symbol} (${candidate.source})`, candidate);

  // Kill switch: log the candidate but go no further.
  if (state.paused) {
    await logDecision({
      candidate,
      action: 'hold',
      conviction: 0,
      reasoning: 'Bot is paused (kill switch); candidate not evaluated.',
      risks: '',
      outcome: 'rejected_paused',
      riskReasons: ['paused'],
      snapshot: null,
      adapter: adapter.kind,
    });
    return;
  }

  try {
    const [quote, account] = await Promise.all([adapter.getQuote(candidate.symbol), adapter.getAccount()]);
    const position = account.positions.find((p) => p.symbol === candidate.symbol);
    const snapshot = {
      price: quote.price,
      cash: account.cash,
      equity: account.equity,
      position: position ?? null,
    };

    // 1. Decision engine.
    const decision = await decide(candidate, {
      quote,
      position,
      account: { cash: account.cash, equity: account.equity },
    });
    const threshold = state.risk.convictionThreshold;
    bus.emitEvent(
      'decision',
      `${decision.action.toUpperCase()} ${candidate.symbol} — conviction ${(decision.conviction * 100).toFixed(0)}% (need ${(threshold * 100).toFixed(0)}%)`,
      { candidate, decision, threshold },
    );

    // 2. Conviction gate.
    if (decision.action === 'hold' || decision.conviction < threshold) {
      await logDecision({
        candidate, ...decision, threshold, outcome: 'held',
        riskReasons: [decision.action === 'hold' ? 'model chose hold' : 'below conviction threshold'],
        snapshot, adapter: adapter.kind,
      });
      return;
    }

    // 3. Live preview (defense in depth) before the risk gate's live check.
    let preview: OrderPreview | undefined;
    if (adapter.isLive) {
      preview = await adapter.previewOrder({ symbol: candidate.symbol, side: candidate.side, quantity: 1 });
      bus.emitEvent('risk', `Robinhood preview for ${candidate.symbol}: ${preview.ok ? 'ok' : 'blocked'}`, preview);
    }

    // 4. Risk gate.
    const risk = evaluateRisk({ candidate, account, quote, isLive: adapter.isLive, preview });
    if (!risk.approved) {
      bus.emitEvent('risk', `Risk gate rejected ${candidate.symbol}: ${risk.reasons.join(' ')}`, risk);
      await logDecision({
        candidate, ...decision, threshold,
        outcome: adapter.isLive && preview && !preview.ok ? 'rejected_preview' : 'rejected_risk',
        riskReasons: risk.reasons, snapshot, adapter: adapter.kind,
      });
      return;
    }

    // 5. Re-preview at the actual sized quantity for live orders.
    if (adapter.isLive) {
      const sizedPreview = await adapter.previewOrder({ symbol: candidate.symbol, side: candidate.side, quantity: risk.quantity });
      if (!sizedPreview.ok) {
        bus.emitEvent('risk', `Sized preview blocked ${candidate.symbol}`, sizedPreview);
        await logDecision({
          candidate, ...decision, threshold, outcome: 'rejected_preview',
          riskReasons: sizedPreview.warnings, snapshot, adapter: adapter.kind,
        });
        return;
      }
    }

    // 6. Place the order.
    const order = await adapter.placeOrder({ symbol: candidate.symbol, side: candidate.side, quantity: risk.quantity });
    recordTrade(candidate.symbol, candidate.side);
    bus.emitEvent('order', `${order.status.toUpperCase()} ${candidate.side} ${risk.quantity} ${candidate.symbol} @ ${order.filledPrice ?? 'market'}`, order);

    const decisionDoc = await logDecision({
      candidate, ...decision, threshold, outcome: 'routed',
      riskReasons: risk.reasons, snapshot, order, adapter: adapter.kind,
    });

    if (isMongoConnected()) {
      await OrderLog.create({
        orderId: order.orderId, symbol: order.symbol, side: order.side, quantity: order.quantity,
        price: order.filledPrice ?? quote.price, status: order.status, adapter: adapter.kind,
        decisionId: decisionDoc?._id,
      });
    }
  } catch (err) {
    bus.emitEvent('error', `Pipeline error for ${candidate.symbol}: ${(err as Error).message}`, { candidate });
    await logDecision({
      candidate, action: 'hold', conviction: 0, reasoning: `Pipeline error: ${(err as Error).message}`,
      risks: '', outcome: 'error', riskReasons: [(err as Error).message], snapshot: null, adapter: adapter.kind,
    });
  }
}

async function logDecision(doc: {
  candidate: Candidate;
  action: string;
  conviction: number;
  reasoning: string;
  risks?: string;
  threshold?: number;
  outcome: string;
  riskReasons: string[];
  snapshot: unknown;
  order?: unknown;
  adapter: string;
}) {
  if (!isMongoConnected()) return null;
  try {
    return await DecisionLog.create({
      source: doc.candidate.source,
      symbol: doc.candidate.symbol,
      side: doc.candidate.side,
      action: doc.action,
      conviction: doc.conviction,
      threshold: doc.threshold,
      reasoning: doc.reasoning,
      risks: doc.risks,
      outcome: doc.outcome,
      riskReasons: doc.riskReasons,
      snapshot: doc.snapshot,
      candidate: doc.candidate,
      order: doc.order,
      adapter: doc.adapter,
    });
  } catch (err) {
    bus.emitEvent('error', `Failed to log decision: ${(err as Error).message}`);
    return null;
  }
}
