import { config } from './config.js';
import type { AdapterKind } from './types.js';
import { bus } from './feed/bus.js';

/**
 * Mutable runtime state — the bits the operator can change at runtime via the
 * Settings tab. Seeded from env config. Kept in memory (single-process bot);
 * persisted snapshots of decisions/orders live in MongoDB.
 */
export interface RuntimeState {
  paused: boolean;
  adapter: AdapterKind;
  risk: {
    maxExposurePct: number;
    maxTradePct: number;
    dailyLossLimitPct: number;
    convictionThreshold: number;
    tradeCooldownMs: number;
  };
  watchlist: string[];
  /** Equity at the start of the trading day, for the daily-loss circuit breaker. */
  dayStartEquity: number | null;
  /** Per-symbol last trade time, for cooldown + flip-flop detection. */
  lastTradeAt: Record<string, number>;
  /** Per-symbol last side, for flip-flop detection. */
  lastSide: Record<string, 'buy' | 'sell'>;
  /** Circuit breaker tripped for the day. */
  circuitBroken: boolean;
}

export const state: RuntimeState = {
  paused: false,
  adapter: config.brokerAdapter,
  risk: { ...config.risk },
  watchlist: [...config.watchlist],
  dayStartEquity: null,
  lastTradeAt: {},
  lastSide: {},
  circuitBroken: false,
};

/** Switching to LIVE is the one transition we make loud and explicit. */
export function setAdapter(next: AdapterKind): void {
  const prev = state.adapter;
  state.adapter = next;
  if (next === 'LIVE' && prev !== 'LIVE') {
    bus.emitEvent('state', '⚠️ Broker adapter switched to LIVE — real orders are now possible.', {
      adapter: next,
    });
  } else {
    bus.emitEvent('state', `Broker adapter switched to ${next}.`, { adapter: next });
  }
}

export function setPaused(paused: boolean): void {
  state.paused = paused;
  bus.emitEvent('state', paused ? 'Bot paused (kill switch).' : 'Bot resumed.', { paused });
}

export function publicState() {
  return {
    paused: state.paused,
    adapter: state.adapter,
    risk: state.risk,
    watchlist: state.watchlist,
    circuitBroken: state.circuitBroken,
  };
}
