import { useEffect, useRef, useState } from 'react';

export interface BotState {
  paused: boolean;
  adapter: 'SIM' | 'PAPER' | 'LIVE';
  timeframe: 'daily' | 'weekly';
  risk: {
    maxExposurePct: number;
    maxTradePct: number;
    dailyLossLimitPct: number;
    convictionThreshold: number;
    tradeCooldownMs: number;
    riskPerTradePct: number;
    stopLossPct: number;
  };
  watchlist: string[];
  circuitBroken: boolean;
  market: { open: boolean; label: string };
  portfolioValue: number;
  mongo: boolean;
}

export interface FeedEvent {
  type: string;
  at: string;
  message: string;
  data?: unknown;
}

export interface NewsItem {
  symbol: string;
  headline: string;
  url?: string;
  source?: string;
  at: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface JournalEntry {
  _id: string;
  at: string;
  source: string;
  symbol: string;
  side: string;
  action: string;
  conviction: number;
  threshold: number;
  reasoning: string;
  risks: string;
  outcome: string;
  riskReasons: string[];
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Poll a JSON endpoint on an interval. */
export function usePolled<T>(path: string, intervalMs = 5000): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      getJSON<T>(path)
        .then((d) => alive && setData(d))
        .catch(() => {});
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, intervalMs]);
  return data;
}

/** Subscribe to the SSE live feed; keeps the most recent `max` events. */
export function useFeed(max = 200): FeedEvent[] {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const ref = useRef<EventSource | null>(null);
  useEffect(() => {
    const es = new EventSource('/api/events');
    ref.current = es;
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as FeedEvent;
        if (!evt.type) return;
        setEvents((prev) => [evt, ...prev].slice(0, max));
      } catch {
        /* ignore non-JSON keepalives */
      }
    };
    return () => es.close();
  }, [max]);
  return events;
}

export const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
