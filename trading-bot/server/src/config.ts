import 'dotenv/config';
import type { AdapterKind } from './types.js';

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/**
 * Static config from the environment. Mutable runtime knobs (active adapter,
 * pause state, risk tuning) live in `state.ts` and are seeded from here.
 */
export const config = {
  port: num('PORT', 8787),
  mongoUri: str('MONGO_URI', 'mongodb://localhost:27017'),
  mongoDb: str('MONGO_DB', 'ai_trading_bot'),

  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  claudeModel: str('CLAUDE_MODEL', 'claude-opus-4-8'),

  tradingViewSecret: str('TRADINGVIEW_WEBHOOK_SECRET'),

  brokerAdapter: (str('BROKER_ADAPTER', 'SIM').toUpperCase() as AdapterKind),

  alpacaKeyId: str('ALPACA_KEY_ID'),
  alpacaSecretKey: str('ALPACA_SECRET_KEY'),
  alpacaBaseUrl: str('ALPACA_BASE_URL', 'https://paper-api.alpaca.markets'),

  robinhoodMcpUrl: str('ROBINHOOD_MCP_URL', 'https://agent.robinhood.com/mcp/trading'),

  // Market-data feed for the sentinel. Finnhub when a key is set; otherwise a
  // keyless Yahoo Finance fallback.
  finnhubApiKey: str('FINNHUB_API_KEY'),
  sentinel: {
    enabled: str('SENTINEL_ENABLED', 'true') !== 'false',
    news: str('SENTINEL_NEWS', 'true') !== 'false',
    movePct: num('SENTINEL_MOVE_PCT', 0.03),
    retriggerMs: num('SENTINEL_RETRIGGER_MS', 30 * 60 * 1000),
  },

  risk: {
    maxExposurePct: num('MAX_EXPOSURE_PCT', 0.5),
    maxTradePct: num('MAX_TRADE_PCT', 0.1),
    dailyLossLimitPct: num('DAILY_LOSS_LIMIT_PCT', 0.05),
    convictionThreshold: num('CONVICTION_THRESHOLD', 0.65),
    tradeCooldownMs: num('TRADE_COOLDOWN_MS', 15 * 60 * 1000),
  },

  simStartingCash: num('SIM_STARTING_CASH', 100_000),

  watchlist: str('WATCHLIST', 'AAPL,MSFT,NVDA,AMZN,GOOGL')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
};

export type AppConfig = typeof config;
