import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import { activeAdapter } from '../brokers/index.js';
import { processCandidate } from '../engine/pipeline.js';
import { marketData, type NewsItem, type SymbolQuote } from './marketData.js';
import { marketStatus } from '../marketHours.js';
import type { Candidate } from '../types.js';

/** Per-symbol bookkeeping so the sentinel doesn't spam the pipeline. */
const lastTriggeredAt: Record<string, number> = {};
const seenNewsUrls = new Set<string>();

export interface MoveDecision {
  side: 'buy' | 'sell';
  condition: string;
}

/**
 * Pure decision: given a quote, whether we hold the name, the configured move
 * threshold and a fresh headline, decide if a sentinel candidate should fire
 * and on which side. Returns null if nothing is actionable.
 *
 *  - up move >= threshold        -> buy (momentum)
 *  - down move <= -threshold AND held -> sell (risk management)
 *  - down move and not held      -> no actionable side; skip
 *
 * The decision engine + risk gate still decide whether anything trades.
 */
export function moveToCandidate(args: {
  quote: SymbolQuote;
  held: boolean;
  movePct: number; // fraction, e.g. 0.03
  topHeadline?: string;
}): MoveDecision | null {
  const { quote, held, movePct, topHeadline } = args;
  const thresholdPct = movePct * 100;
  const chg = quote.changePct;
  if (!Number.isFinite(chg) || Math.abs(chg) < thresholdPct) return null;

  let side: 'buy' | 'sell';
  if (chg >= thresholdPct) side = 'buy';
  else if (held) side = 'sell';
  else return null;

  const move = `${chg > 0 ? '+' : ''}${chg.toFixed(1)}% intraday (≈$${quote.price.toFixed(2)})`;
  const condition = topHeadline
    ? `Sentinel: ${quote.symbol} ${move} · News: ${topHeadline}`
    : `Sentinel: ${quote.symbol} ${move}`;
  return { side, condition };
}

/**
 * One sentinel sweep: poll real prices + news for the watchlist, surface fresh
 * headlines to the live feed, and route urgent price-move candidates through
 * the pipeline. Gated to market hours for price triggers; resilient to
 * per-symbol provider failures.
 */
export async function runSentinel(): Promise<void> {
  if (state.paused || !config.sentinel.enabled) return;
  const { open } = marketStatus();
  const provider = marketData();

  let heldSymbols = new Set<string>();
  try {
    heldSymbols = new Set((await activeAdapter().getPositions()).map((p) => p.symbol));
  } catch {
    /* adapter may need credentials; treat as holding nothing */
  }

  let scanned = 0;
  let newsCount = 0;
  let fired = 0;

  for (const symbol of state.watchlist) {
    try {
      const [quote, news] = await Promise.all([
        provider.getQuote(symbol),
        config.sentinel.news ? provider.getNews(symbol) : Promise.resolve([] as NewsItem[]),
      ]);
      scanned += 1;

      // Surface fresh headlines (deduped by URL) to the live feed.
      const fresh = news.filter((n) => n.url && !seenNewsUrls.has(n.url));
      for (const n of fresh) {
        seenNewsUrls.add(n.url!);
        newsCount += 1;
        bus.emitEvent('news', `${symbol}: ${n.headline}`, n);
      }

      if (!quote) continue;

      // Price-move triggers only during market hours.
      if (!open) continue;

      // Per-symbol retrigger cooldown so we don't fire every sweep.
      const last = lastTriggeredAt[symbol];
      if (last && Date.now() - last < config.sentinel.retriggerMs) continue;

      const decision = moveToCandidate({
        quote,
        held: heldSymbols.has(symbol),
        movePct: config.sentinel.movePct,
        topHeadline: news[0]?.headline,
      });
      if (!decision) continue;

      lastTriggeredAt[symbol] = Date.now();
      fired += 1;
      const candidate: Candidate = {
        id: randomUUID(),
        source: 'sentinel',
        symbol,
        side: decision.side,
        condition: decision.condition,
        raw: { quote, news: news.slice(0, 3) },
        createdAt: new Date().toISOString(),
      };
      bus.emitEvent('candidate', `Sentinel flagged ${decision.side.toUpperCase()} ${symbol} (${quote.changePct.toFixed(1)}%)`, candidate);
      await processCandidate(candidate);
    } catch (err) {
      bus.emitEvent('error', `Sentinel ${symbol} failed: ${(err as Error).message}`);
    }
  }

  // Keep the seen-news set from growing unbounded.
  if (seenNewsUrls.size > 500) seenNewsUrls.clear();

  bus.emitEvent(
    'log',
    `Sentinel sweep: scanned ${scanned}/${state.watchlist.length}, ${newsCount} new headline(s), ${fired} candidate(s)${open ? '' : ' (market closed — price triggers paused)'}.`,
  );
}
