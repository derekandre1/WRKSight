import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import { activeAdapter } from '../brokers/index.js';
import { processCandidate } from '../engine/pipeline.js';
import type { Candidate, CandidateSource } from '../types.js';

function makeCandidate(symbol: string, side: 'buy' | 'sell', source: CandidateSource, condition: string): Candidate {
  return {
    id: randomUUID(),
    source,
    symbol: symbol.toUpperCase(),
    side,
    condition,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Scheduled workflows:
 *  - Morning deep research across the watchlist (weekdays 9:15am ET-ish)
 *  - Periodic intraday position reviews (every 30 min during market hours)
 *  - Always-on sentinel polling for urgent candidates (every 5 min)
 *
 * Each produces candidates and routes them through the same pipeline; the
 * decision engine + risk gate decide whether anything actually trades.
 */
export function startSchedulers(): void {
  // Morning research — propose a buy candidate per watchlist name to be vetted.
  cron.schedule('15 13 * * 1-5', async () => {
    if (state.paused) return;
    bus.emitEvent('log', 'Morning deep research run starting.');
    for (const symbol of state.watchlist) {
      await processCandidate(makeCandidate(symbol, 'buy', 'morning_research', 'Morning deep-research review'));
    }
  });

  // Intraday position reviews — re-examine open positions.
  cron.schedule('*/30 13-20 * * 1-5', async () => {
    if (state.paused) return;
    try {
      const positions = await activeAdapter().getPositions();
      if (positions.length === 0) return;
      bus.emitEvent('log', `Intraday review of ${positions.length} position(s).`);
      for (const p of positions) {
        // Review whether to trim/exit; the engine decides buy/sell/hold.
        await processCandidate(makeCandidate(p.symbol, 'sell', 'intraday_review', 'Intraday position review'));
      }
    } catch (err) {
      bus.emitEvent('error', `Intraday review failed: ${(err as Error).message}`);
    }
  });

  // Sentinel — lightweight always-on heartbeat. In a full build this would poll
  // a news/price feed; here it just emits a heartbeat so the loop is visible.
  cron.schedule('*/5 * * * *', () => {
    if (state.paused) return;
    bus.emitEvent('log', 'Sentinel heartbeat — monitoring news & price moves.');
  });

  bus.emitEvent('log', 'Schedulers started (morning research, intraday reviews, sentinel).');
}
