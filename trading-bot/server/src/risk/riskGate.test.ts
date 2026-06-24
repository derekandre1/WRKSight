import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateRisk, recordTrade } from './riskGate.js';
import { state } from '../state.js';
import type { AccountSnapshot, Candidate, Quote } from '../types.js';

const account: AccountSnapshot = {
  cash: 100_000,
  equity: 100_000,
  buyingPower: 100_000,
  positions: [],
};
const quote: Quote = { symbol: 'AAPL', price: 100, asOf: new Date().toISOString() };

function buy(symbol = 'AAPL'): Candidate {
  return { id: '1', source: 'sentinel', symbol, side: 'buy', createdAt: new Date().toISOString() };
}

describe('risk gate', () => {
  beforeEach(() => {
    state.risk = { maxExposurePct: 0.5, maxTradePct: 0.1, dailyLossLimitPct: 0.05, convictionThreshold: 0.65, tradeCooldownMs: 900_000 };
    state.dayStartEquity = 100_000;
    state.circuitBroken = false;
    state.lastTradeAt = {};
    state.lastSide = {};
  });

  it('sizes a buy to the per-trade cap', () => {
    const r = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    expect(r.approved).toBe(true);
    // 10% of 100k = $10k budget / $100 = 100 shares.
    expect(r.quantity).toBe(100);
  });

  it('blocks live orders without a passing preview', () => {
    const r = evaluateRisk({ candidate: buy(), account, quote, isLive: true });
    expect(r.approved).toBe(false);
  });

  it('enforces the cooldown', () => {
    recordTrade('AAPL', 'buy');
    const r = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    expect(r.approved).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/cooldown/i);
  });

  it('trips the daily-loss circuit breaker', () => {
    const losing: AccountSnapshot = { ...account, equity: 94_000 };
    const r = evaluateRisk({ candidate: buy(), account: losing, quote, isLive: false });
    expect(r.approved).toBe(false);
    expect(state.circuitBroken).toBe(true);
  });

  it('refuses to exceed the exposure cap', () => {
    const heavy: AccountSnapshot = {
      ...account,
      positions: [{ symbol: 'MSFT', quantity: 1, avgPrice: 50_000, marketPrice: 50_000, marketValue: 50_000, unrealizedPnl: 0 }],
    };
    const r = evaluateRisk({ candidate: buy(), account: heavy, quote, isLive: false });
    expect(r.approved).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/exposure/i);
  });
});
