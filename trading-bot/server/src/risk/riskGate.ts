import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import type { AccountSnapshot, Candidate, OrderPreview, Quote, RiskResult } from '../types.js';

/**
 * The risk gate sits on top of EVERY adapter. It runs before any order and can
 * shrink, or outright reject, a trade. For live orders it also requires the
 * broker's own preview to have passed.
 *
 * Enforces: position sizing, exposure caps, daily loss circuit breaker, trade
 * cooldowns, flip-flop detection, and the live-preview requirement.
 */
export function evaluateRisk(args: {
  candidate: Candidate;
  account: AccountSnapshot;
  quote: Quote;
  isLive: boolean;
  preview?: OrderPreview;
}): RiskResult {
  const { candidate, account, quote, isLive, preview } = args;
  const { risk } = state;
  const reasons: string[] = [];
  const now = Date.now();

  // 0. Daily loss circuit breaker.
  if (state.dayStartEquity == null) state.dayStartEquity = account.equity;
  const dayPnlPct = (account.equity - state.dayStartEquity) / Math.max(1, state.dayStartEquity);
  if (state.circuitBroken || dayPnlPct <= -risk.dailyLossLimitPct) {
    if (!state.circuitBroken) {
      state.circuitBroken = true;
      bus.emitEvent(
        'risk',
        `Daily loss circuit breaker tripped (${(dayPnlPct * 100).toFixed(2)}% <= -${(risk.dailyLossLimitPct * 100).toFixed(0)}%). No new trades today.`,
      );
    }
    return { approved: false, quantity: 0, reasons: ['Daily loss circuit breaker active.'] };
  }

  // 1. Live orders must have passed the broker preview.
  if (isLive && (!preview || !preview.ok)) {
    return {
      approved: false,
      quantity: 0,
      reasons: ['Live order failed or is missing the broker preview.', ...(preview?.warnings ?? [])],
    };
  }

  // 2. Trade cooldown (per symbol).
  const last = state.lastTradeAt[candidate.symbol];
  if (last && now - last < risk.tradeCooldownMs) {
    const waitMs = risk.tradeCooldownMs - (now - last);
    return {
      approved: false,
      quantity: 0,
      reasons: [`In cooldown for ${candidate.symbol} (${Math.ceil(waitMs / 1000)}s remaining).`],
    };
  }

  // 3. Flip-flop detection: opposite side immediately after the last trade.
  const lastSide = state.lastSide[candidate.symbol];
  if (lastSide && lastSide !== candidate.side && last && now - last < risk.tradeCooldownMs * 2) {
    return {
      approved: false,
      quantity: 0,
      reasons: [`Flip-flop guard: just went ${lastSide} on ${candidate.symbol}; refusing immediate ${candidate.side}.`],
    };
  }

  // 4. Sizing for sells: never sell more than we hold.
  const position = account.positions.find((p) => p.symbol === candidate.symbol);
  if (candidate.side === 'sell') {
    const qty = position?.quantity ?? 0;
    if (qty <= 0) return { approved: false, quantity: 0, reasons: ['No position to sell.'] };
    return { approved: true, quantity: qty, reasons: ['Selling full position.'] };
  }

  // 5. Sizing for buys: per-trade cap and total exposure cap.
  const price = preview?.estimatedPrice || quote.price;
  if (price <= 0) return { approved: false, quantity: 0, reasons: ['No valid price.'] };

  const perTradeBudget = account.equity * risk.maxTradePct;
  const currentExposure = account.positions.reduce((s, p) => s + p.marketValue, 0);
  const exposureHeadroom = account.equity * risk.maxExposurePct - currentExposure;

  if (exposureHeadroom <= 0) {
    return {
      approved: false,
      quantity: 0,
      reasons: [`Exposure cap reached (${(risk.maxExposurePct * 100).toFixed(0)}% of equity already deployed).`],
    };
  }

  const budget = Math.min(perTradeBudget, exposureHeadroom, account.buyingPower);
  const quantity = Math.floor(budget / price);

  if (quantity <= 0) {
    return {
      approved: false,
      quantity: 0,
      reasons: [`Budget ($${budget.toFixed(2)}) too small for one share at $${price.toFixed(2)}.`],
    };
  }

  reasons.push(
    `Sized to ${quantity} share(s): per-trade cap $${perTradeBudget.toFixed(0)}, exposure headroom $${exposureHeadroom.toFixed(0)}.`,
  );
  return { approved: true, quantity, reasons };
}

/** Record a trade so cooldown / flip-flop tracking works. */
export function recordTrade(symbol: string, side: 'buy' | 'sell'): void {
  state.lastTradeAt[symbol] = Date.now();
  state.lastSide[symbol] = side;
}
