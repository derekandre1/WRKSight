// Shared domain types for the trading bot.

export type AdapterKind = 'SIM' | 'PAPER' | 'LIVE';

/** Trading horizon the bot reasons and acts on. */
export type Timeframe = 'daily' | 'weekly';

export type OrderSide = 'buy' | 'sell';

export type CandidateSource = 'tradingview' | 'morning_research' | 'intraday_review' | 'sentinel';

/** A tradeable idea, before any decision is made. */
export interface Candidate {
  id: string;
  source: CandidateSource;
  symbol: string;
  side: OrderSide;
  /** Free-text condition/thesis that produced this candidate (e.g. a TradingView alert). */
  condition?: string;
  /** Raw payload that produced the candidate, for the audit log. */
  raw?: Record<string, unknown>;
  createdAt: string;
}

export interface Quote {
  symbol: string;
  price: number;
  /** ISO timestamp of the quote. */
  asOf: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface AccountSnapshot {
  cash: number;
  equity: number;
  buyingPower: number;
  positions: Position[];
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  quantity: number;
  /** Omitted => market order. */
  limitPrice?: number;
}

export interface OrderPreview {
  ok: boolean;
  symbol: string;
  side: OrderSide;
  quantity: number;
  estimatedPrice: number;
  estimatedCost: number;
  /** Broker-side warnings (e.g. from Robinhood's review_equity_order). */
  warnings: string[];
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  filledPrice?: number;
  status: 'filled' | 'accepted' | 'rejected' | 'simulated';
  message?: string;
}

export interface ActivityItem {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  status: string;
  at: string;
}

/** Output of the Claude decision engine for one candidate. */
export interface Decision {
  conviction: number; // 0..1
  action: 'buy' | 'sell' | 'hold';
  reasoning: string;
  /** Short risk notes from the model. */
  risks?: string;
}

export interface RiskResult {
  approved: boolean;
  /** Quantity the risk gate will allow (may be smaller than requested). */
  quantity: number;
  reasons: string[];
}
