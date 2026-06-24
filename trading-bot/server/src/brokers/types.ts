import type {
  AccountSnapshot,
  ActivityItem,
  AdapterKind,
  OrderPreview,
  OrderRequest,
  OrderResult,
  Position,
  Quote,
} from '../types.js';

/**
 * The broker abstraction. Three implementations exist:
 *  - SimulationAdapter (dry-run, fake fills, no external calls) — the default
 *  - AlpacaPaperAdapter (real sandbox, no real money)
 *  - RobinhoodMcpAdapter (live, equities only, via Robinhood's Trading MCP)
 *
 * The risk gate sits on top of every adapter. For live orders, `previewOrder`
 * MUST pass before `placeOrder` is called.
 */
export interface BrokerAdapter {
  readonly kind: AdapterKind;
  /** True only for the live adapter — used by the risk gate to require previews. */
  readonly isLive: boolean;

  getPositions(): Promise<Position[]>;
  getAccount(): Promise<AccountSnapshot>;
  getQuote(symbol: string): Promise<Quote>;
  previewOrder(req: OrderRequest): Promise<OrderPreview>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getActivity(): Promise<ActivityItem[]>;
}
