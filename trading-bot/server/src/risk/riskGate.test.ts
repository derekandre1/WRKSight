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
    state.risk = {
      maxExposurePct: 0.5,
      maxTradePct: 0.1,
      dailyLossLimitPct: 0.05,
      convictionThreshold: 0.65,
      tradeCooldownMs: 900_000,
      riskPerTradePct: 0.01,
      stopLossPct: 0.07,
    };
    state.dayStartEquity = 100_000;
    state.circuitBroken = false;
    state.lastTradeAt = {};
    state.lastSide = {};
  });

  it('sizes a buy to the per-trade cap when that is the binding constraint', () => {
    const r = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    expect(r.approved).toBe(true);
    // risk budget 1% of 100k / (7% * $100 stop) = 142 shares, but the 10%
    // per-trade cap ($10k / $100) binds first at 100.
    expect(r.quantity).toBe(100);
  });

  it('sizes by fixed-fractional risk when the stop is the binding constraint', () => {
    state.risk.maxTradePct = 1; // remove the notional cap so risk binds
    state.risk.riskPerTradePct = 0.005; // risk $500
    state.risk.stopLossPct = 0.1; // $10 stop distance -> 50 shares
    const r = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    expect(r.quantity).toBe(50);
    expect(r.stopPrice).toBe(90); // $100 * (1 - 0.10)
    expect(r.reasons.join(' ')).toMatch(/risk-per-trade/i);
  });

  it('a wider (weekly) stop yields a smaller size for the same dollar risk', () => {
    state.risk.maxTradePct = 1;
    state.risk.maxExposurePct = 1;
    state.risk.stopLossPct = 0.07;
    const daily = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    state.risk.stopLossPct = 0.14; // weekly: double the stop
    state.lastTradeAt = {};
    const weekly = evaluateRisk({ candidate: buy(), account, quote, isLive: false });
    expect(weekly.quantity).toBeLessThan(daily.quantity);
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
