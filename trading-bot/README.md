# AI Trading Bot

Autonomous AI-powered stock trading bot with a real-time monitoring dashboard.
Lives alongside (and independent of) the WRKSight app in this repo.

- **Backend:** Node + Express + TypeScript (`server/`)
- **Frontend:** React + Vite + Tailwind (`web/`)
- **Persistence:** MongoDB
- **Decision engine:** Anthropic Claude API (`claude-opus-4-8`)
- **Execution:** Broker adapter pattern — `SimulationAdapter` (default), `AlpacaPaperAdapter`, `RobinhoodMcpAdapter`
- **Signals:** TradingView webhooks + scheduled internal research

> ⚠️ Defaults to **SIMULATION**. It will never place a real order until you
> explicitly switch the adapter to `LIVE` in Settings. See "Going live" below.

## Architecture

```
TradingView webhook ─┐
Scheduled workflows ─┼─► Candidate ─► Decision engine (Claude) ─► Risk gate ─► Broker adapter ─► Order
News/price sentinel ─┘                      │                         │              │
                                            └──────────── logged to MongoDB ─────────┘
                                                          (every decision, hold, reject)
                            All events also stream to the dashboard via SSE.
```

The active broker adapter is chosen by config (`BROKER_ADAPTER`) or at runtime
in Settings. Every order passes the **risk gate**; live orders additionally
require Robinhood's `review_equity_order` preview to pass before
`place_equity_order` is called.

## Quick start

```bash
# 1. Backend
cd server
cp .env.example .env        # fill in ANTHROPIC_API_KEY, TRADINGVIEW_WEBHOOK_SECRET
npm install
npm run dev                 # http://localhost:8787

# 2. Frontend (separate terminal)
cd web
npm install
npm run dev                 # http://localhost:5173 (proxies /api and /events to backend)
```

You need a local MongoDB (`mongodb://localhost:27017` by default) — or set
`MONGO_URI` to a hosted cluster.

## Configuration (`server/.env`)

| Var | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required for real Claude decisions. Without it, a deterministic stub scores candidates so the pipeline still runs offline. |
| `TRADINGVIEW_WEBHOOK_SECRET` | — | Shared secret. Set the same value in your TradingView alert payload. |
| `BROKER_ADAPTER` | `SIM` | `SIM` \| `PAPER` \| `LIVE`. |
| `MONGO_URI` | `mongodb://localhost:27017` | |
| `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` | — | Only for `PAPER`. |
| `MAX_EXPOSURE_PCT` | `0.5` | Risk: max portfolio fraction deployed. |
| `MAX_TRADE_PCT` | `0.1` | Risk: max single-trade fraction. |
| `DAILY_LOSS_LIMIT_PCT` | `0.05` | Risk: daily loss circuit breaker. |
| `CONVICTION_THRESHOLD` | `0.65` | Min Claude conviction to route an order. |
| `TIMEFRAME` | `daily` | Trading horizon: `daily` or `weekly`. |
| `FINNHUB_API_KEY` | — | Optional. Enables Finnhub for sentinel quotes + news; else keyless Yahoo. |
| `SENTINEL_DAILY_MOVE_PCT` | `0.03` | Daily move that flags a candidate. |
| `SENTINEL_WEEKLY_MOVE_PCT` | `0.07` | Weekly move that flags a candidate. |
| `SENTINEL_RETRIGGER_MS` | `21600000` | Min time between sentinel triggers per symbol (6h). |

## TradingView webhook

Point a TradingView Pro+ alert at `POST http://<host>/webhooks/tradingview`
with a JSON body. The shared secret can be sent as the `secret` field or the
`X-Webhook-Secret` header:

```json
{
  "secret": "your-tradingview-webhook-secret",
  "symbol": "AAPL",
  "action": "buy",
  "condition": "RSI crossed below 30",
  "price": 187.4
}
```

A raw alert is **never** traded directly — it becomes a candidate and is routed
through the decision engine and risk gate like any other signal.

## Sentinel (real price + news feed)

The always-on sentinel polls a real market-data provider every 5 minutes,
surfaces fresh headlines to the live feed (`news` filter), and routes urgent
price-move candidates through the pipeline. Provider is pluggable:

- **Finnhub** when `FINNHUB_API_KEY` is set — clean JSON quotes + company news
  (free tier at https://finnhub.io).
- **Yahoo Finance** keyless fallback — quotes via the v8 chart endpoint, news
  via the per-symbol RSS feed.

> Note: Yahoo's public endpoints often block datacenter / cloud egress IPs
> (you'll see `403`/connection errors in the live feed). For any hosted
> deployment, set `FINNHUB_API_KEY` — the sentinel logs each failed symbol and
> keeps sweeping, so a blocked provider degrades cleanly rather than crashing.

Each hourly sweep pulls quotes + recent headlines for every watchlist symbol and
evaluates the return over the **active timeframe** (see below). A move beyond the
horizon's threshold **during market hours** flags a candidate: a large up-move →
**buy** (momentum); a large down-move → **sell** only if the position is held.
Per-symbol retriggering is throttled by `SENTINEL_RETRIGGER_MS` (default 6h).
The decision engine and risk gate still decide whether anything trades.

## Trading horizon (daily / weekly)

The bot trades on a **daily/weekly** swing/position horizon, not intraday. Set
`TIMEFRAME` (or switch live in Settings). It changes:

- **Sentinel thresholds** — `SENTINEL_DAILY_MOVE_PCT` (default 3%) for daily,
  `SENTINEL_WEEKLY_MOVE_PCT` (default 7%) for weekly (computed from a ~5-session
  daily-close return; falls back to the daily change if a close series isn't
  available from the provider).
- **Cadence** — morning research once daily, one position review near the close,
  hourly sentinel sweeps. No intraday churn. Default trade cooldown is 1 day.
- **Decision engine** — Claude is told its horizon is daily/weekly and reasons on
  multi-day trend and the durability of the thesis, and it **factors recent news
  sentiment** into conviction (positive catalysts raise buy conviction, negative
  news lowers it). Recent headlines are passed with every candidate.

## Risk profiles (per timeframe)

Each timeframe has its own risk profile, anchored on the standard
**fixed-fractional** method: a constant `RISK_PER_TRADE_PCT` (default 1% of
equity at risk per trade), with the **stop distance scaled to the horizon**
(daily ~7%, weekly ~14%). Position size is the *most constraining* of:

1. fixed-fractional risk budget ÷ stop distance,
2. per-trade notional cap,
3. exposure headroom,
4. buying power.

So a wider weekly stop produces a *smaller* position for the same dollar risk —
the textbook relationship. Weekly otherwise allows larger notional/exposure caps
and a longer cooldown (fewer, longer-held positions). Switching the timeframe in
Settings activates that profile; the risk form edits whichever profile is
active. Each buy logs a protective **stop price**, and the end-of-day review
flags any position trading below its stop.

## Going live (Robinhood agentic)

Robinhood equities have no API key/secret. The bot connects as an **MCP client**
to Robinhood's Trading MCP server on a dedicated **Agentic Account**. See
`server/src/brokers/robinhoodMcp.ts` and the setup walkthrough in the project
notes. In short:

1. In the Robinhood app, open a dedicated **Agentic Trading account** and fund it
   separately from your main portfolio.
2. Connect this agent via the Robinhood Trading MCP
   (`https://agent.robinhood.com/mcp/trading`, OAuth — you approve in the RH
   mobile app; the agent never sees your password).
3. Set `BROKER_ADAPTER=LIVE` only when you are ready, and confirm the switch in
   Settings. Equities only (RH agentic trading is beta).
