import { config } from './config.js';
import type { AdapterKind, RiskProfile, Timeframe } from './types.js';
import { bus } from './feed/bus.js';

/**
 * Mutable runtime state — the bits the operator can change at runtime via the
 * Settings tab. Seeded from env config. Kept in memory (single-process bot);
 * persisted snapshots of decisions/orders live in MongoDB.
 */
export interface RuntimeState {
  paused: boolean;
  adapter: AdapterKind;
  timeframe: Timeframe;
  /** One risk profile per timeframe. */
  profiles: Record<Timeframe, RiskProfile>;
  /** Reference to the profile for the active timeframe (profiles[timeframe]). */
  risk: RiskProfile;
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

const initialTimeframe: Timeframe = config.timeframe === 'weekly' ? 'weekly' : 'daily';
const profiles: Record<Timeframe, RiskProfile> = {
  daily: { ...config.riskProfiles.daily },
  weekly: { ...config.riskProfiles.weekly },
};

export const state: RuntimeState = {
  paused: false,
  adapter: config.brokerAdapter,
  timeframe: initialTimeframe,
  profiles,
  // `risk` always references the active profile object, so edits to it persist
  // on that profile and switching timeframe swaps which profile is active.
  risk: profiles[initialTimeframe],
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

export function setTimeframe(next: Timeframe): void {
  state.timeframe = next;
  // Activate that timeframe's risk profile (wider stop, different caps, etc.).
  state.risk = state.profiles[next];
  bus.emitEvent('state', `Trading horizon set to ${next} (risk profile activated).`, {
    timeframe: next,
    risk: state.risk,
  });
}

export function publicState() {
  return {
    paused: state.paused,
    adapter: state.adapter,
    timeframe: state.timeframe,
    risk: state.risk,
    profiles: state.profiles,
    watchlist: state.watchlist,
    circuitBroken: state.circuitBroken,
  };
}
