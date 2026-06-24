import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import { activeAdapter } from '../brokers/index.js';
import { processCandidate } from '../engine/pipeline.js';
import { marketData, weeklyReturnPct, type NewsItem, type SymbolQuote } from './marketData.js';
import { addNews } from './newsStore.js';
import { marketStatus } from '../marketHours.js';
import type { Candidate, Timeframe } from '../types.js';

/** Per-symbol bookkeeping so the sentinel doesn't spam the pipeline. */
const lastTriggeredAt: Record<string, number> = {};
const seenNewsUrls = new Set<string>();

export interface MoveDecision {
  side: 'buy' | 'sell';
  condition: string;
}

/**
 * Pure decision: given the return over the active timeframe, whether we hold
 * the name, and the configured threshold, decide whether a sentinel candidate
 * should fire and on which side. Returns null if nothing is actionable.
 *
 *  - up move >= threshold             -> buy (momentum)
 *  - down move <= -threshold AND held -> sell (risk management)
 *  - down move and not held           -> no actionable side; skip
 *
 * The decision engine + risk gate still decide whether anything trades.
 */
export function moveToCandidate(args: {
  quote: SymbolQuote;
  returnPct: number;
  held: boolean;
  movePct: number; // fraction, e.g. 0.03
  timeframe: Timeframe;
  topHeadline?: string;
}): MoveDecision | null {
  const { quote, returnPct, held, movePct, timeframe, topHeadline } = args;
  const thresholdPct = movePct * 100;
  if (!Number.isFinite(returnPct) || Math.abs(returnPct) < thresholdPct) return null;

  let side: 'buy' | 'sell';
  if (returnPct >= thresholdPct) side = 'buy';
  else if (held) side = 'sell';
  else return null;

  const move = `${returnPct > 0 ? '+' : ''}${returnPct.toFixed(1)}% ${timeframe} (≈$${quote.price.toFixed(2)})`;
  const condition = topHeadline
    ? `Sentinel (${timeframe}): ${quote.symbol} ${move} · News: ${topHeadline}`
    : `Sentinel (${timeframe}): ${quote.symbol} ${move}`;
  return { side, condition };
}

/**
 * One sentinel sweep: poll real prices + news for the watchlist, surface fresh
 * headlines, and route candidates whose move over the ACTIVE TIMEFRAME (daily
 * or weekly) clears the threshold. Price triggers are gated to market hours;
 * resilient to per-symbol provider failures.
 */
export async function runSentinel(): Promise<void> {
  if (state.paused || !config.sentinel.enabled) return;
  const { open } = marketStatus();
  const provider = marketData();
  const timeframe = state.timeframe;
  const movePct = timeframe === 'weekly' ? config.sentinel.weeklyMovePct : config.sentinel.dailyMovePct;

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
      const [quote, news, closes] = await Promise.all([
        provider.getQuote(symbol),
        config.sentinel.news ? provider.getNews(symbol) : Promise.resolve([] as NewsItem[]),
        timeframe === 'weekly' ? provider.getDailyCloses(symbol) : Promise.resolve([] as number[]),
      ]);
      scanned += 1;

      // Surface fresh headlines (deduped by URL) to the live feed + news panel.
      if (news.length) addNews(news);
      const fresh = news.filter((n) => n.url && !seenNewsUrls.has(n.url));
      for (const n of fresh) {
        seenNewsUrls.add(n.url!);
        newsCount += 1;
        bus.emitEvent('news', `${symbol}: ${n.headline}`, n);
      }

      if (!quote) continue;
      if (!open) continue; // price-move triggers only during market hours

      // Per-symbol retrigger cooldown so we don't fire every sweep.
      const last = lastTriggeredAt[symbol];
      if (last && Date.now() - last < config.sentinel.retriggerMs) continue;

      // Return over the active timeframe. Weekly falls back to the daily change
      // when a daily close series isn't available from the provider.
      const weekly = timeframe === 'weekly' ? weeklyReturnPct(closes) : null;
      const returnPct = timeframe === 'weekly' && weekly !== null ? weekly : quote.changePct;

      const decision = moveToCandidate({
        quote,
        returnPct,
        held: heldSymbols.has(symbol),
        movePct,
        timeframe,
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
        raw: { quote, returnPct, timeframe, news: news.slice(0, 3) },
        createdAt: new Date().toISOString(),
      };
      bus.emitEvent('candidate', `Sentinel flagged ${decision.side.toUpperCase()} ${symbol} (${returnPct.toFixed(1)}% ${timeframe})`, candidate);
      await processCandidate(candidate);
    } catch (err) {
      bus.emitEvent('error', `Sentinel ${symbol} failed: ${(err as Error).message}`);
    }
  }

  // Keep the seen-news set from growing unbounded.
  if (seenNewsUrls.size > 500) seenNewsUrls.clear();

  bus.emitEvent(
    'log',
    `Sentinel sweep (${timeframe}): scanned ${scanned}/${state.watchlist.length}, ${newsCount} new headline(s), ${fired} candidate(s)${open ? '' : ' (market closed — price triggers paused)'}.`,
  );
}
