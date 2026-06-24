import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { state } from './state.js';
import { bus } from './feed/bus.js';
import { connectMongo } from './db/mongo.js';
import { apiRouter } from './routes/api.js';
import { tradingViewRouter } from './signals/tradingview.js';
import { startSchedulers } from './signals/scheduler.js';
import { activeAdapter } from './brokers/index.js';

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, adapter: state.adapter }));
  app.use('/api', apiRouter);
  app.use('/webhooks', tradingViewRouter);

  await connectMongo();

  // Seed day-start equity for the circuit breaker (best effort).
  try {
    state.dayStartEquity = (await activeAdapter().getAccount()).equity;
  } catch {
    /* adapter may need credentials; will seed lazily on first risk check */
  }

  startSchedulers();

  app.listen(config.port, () => {
    bus.emitEvent('log', `Trading bot server listening on :${config.port} (adapter=${state.adapter}).`);
    // eslint-disable-next-line no-console
    console.log(`AI trading bot listening on http://localhost:${config.port}`);
    if (!config.anthropicApiKey) {
      console.log('  ⚠️  No ANTHROPIC_API_KEY — using offline heuristic decision engine.');
    }
    if (!config.tradingViewSecret) {
      console.log('  ⚠️  No TRADINGVIEW_WEBHOOK_SECRET — webhook endpoint will reject all alerts.');
    }
    console.log(`  Broker adapter: ${state.adapter} (never goes LIVE without an explicit switch).`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
