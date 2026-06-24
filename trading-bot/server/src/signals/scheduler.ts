import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { state } from '../state.js';
import { bus } from '../feed/bus.js';
import { activeAdapter } from '../brokers/index.js';
import { processCandidate } from '../engine/pipeline.js';
import { runSentinel } from './sentinel.js';
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
 * Scheduled workflows, tuned for a DAILY/WEEKLY horizon (no intraday churn):
 *  - Morning deep research across the watchlist (weekdays ~9:15am ET)
 *  - One position review near the close (weekdays ~3:45pm ET)
 *  - Sentinel sweeps hourly during the session for daily/weekly moves + news
 *
 * Each produces candidates and routes them through the same pipeline; the
 * decision engine + risk gate decide whether anything actually trades.
 */
export function startSchedulers(): void {
  // Morning research — propose a buy candidate per watchlist name to be vetted.
  // 13:15 UTC ≈ 9:15am ET.
  cron.schedule('15 13 * * 1-5', async () => {
    if (state.paused) return;
    bus.emitEvent('log', `Morning deep research run starting (${state.timeframe} horizon).`);
    for (const symbol of state.watchlist) {
      await processCandidate(makeCandidate(symbol, 'buy', 'morning_research', `Morning ${state.timeframe} research review`));
    }
  });

  // End-of-day position review — re-examine open positions once, near the close.
  // 19:45 UTC ≈ 3:45pm ET. The engine decides trim/exit/hold on the active horizon.
  cron.schedule('45 19 * * 1-5', async () => {
    if (state.paused) return;
    try {
      const positions = await activeAdapter().getPositions();
      if (positions.length === 0) return;
      bus.emitEvent('log', `End-of-day review of ${positions.length} position(s).`);
      for (const p of positions) {
        // Protective-stop check: flag a breach explicitly so the engine sees it.
        const stop = p.avgPrice * (1 - state.risk.stopLossPct);
        const breached = p.marketPrice < stop;
        const condition = breached
          ? `Stop breached: ${p.symbol} $${p.marketPrice.toFixed(2)} < stop $${stop.toFixed(2)} (-${(state.risk.stopLossPct * 100).toFixed(0)}%)`
          : 'End-of-day position review';
        if (breached) bus.emitEvent('risk', condition, { symbol: p.symbol, stop, price: p.marketPrice });
        await processCandidate(makeCandidate(p.symbol, 'sell', 'intraday_review', condition));
      }
    } catch (err) {
      bus.emitEvent('error', `Position review failed: ${(err as Error).message}`);
    }
  });

  // Sentinel — polls a real price + news feed hourly, surfaces fresh headlines,
  // and routes candidates whose daily/weekly move clears the threshold.
  cron.schedule('0 * * * *', () => {
    void runSentinel();
  });
  // Kick off an immediate first sweep so the feed isn't empty at startup.
  void runSentinel();

  bus.emitEvent('log', `Schedulers started (morning research, EOD review, hourly sentinel; ${state.timeframe} horizon).`);
}
