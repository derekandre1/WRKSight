import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BrokerAdapter } from './types.js';
import type {
  AccountSnapshot,
  ActivityItem,
  OrderPreview,
  OrderRequest,
  OrderResult,
  Position,
  Quote,
} from '../types.js';

/**
 * LIVE adapter. Robinhood equities have no REST API key/secret — the bot acts
 * as an MCP client against Robinhood's Trading MCP server on a dedicated
 * *Agentic Account*. Auth is OAuth, approved in the Robinhood mobile app; the
 * agent never sees the user's password.
 *
 * Endpoint (Streamable HTTP): https://agent.robinhood.com/mcp/trading
 *
 * Tool names used here come from Robinhood's agentic-trading docs:
 *   read:  get_equity_positions, get_portfolio, get_accounts,
 *          get_equity_quotes, get_equity_orders, search
 *   trade: review_equity_order (preview) -> place_equity_order, cancel_equity_order
 *
 * Robinhood agentic trading is currently beta and EQUITIES ONLY. This adapter
 * handles equities and fails cleanly on anything else. Because exact tool I/O
 * schemas may evolve, every call parses defensively and the connection
 * introspects the live tool list (`listTools`) on connect.
 */
export class RobinhoodMcpAdapter implements BrokerAdapter {
  readonly kind = 'LIVE' as const;
  readonly isLive = true;

  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private toolNames = new Set<string>();

  constructor(
    private readonly url: string,
    /** Optional bearer token if you already completed the OAuth handshake out-of-band. */
    private readonly accessToken?: string,
  ) {}

  private async ensureConnected(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StreamableHTTPClientTransport(new URL(this.url), {
          requestInit: this.accessToken
            ? { headers: { Authorization: `Bearer ${this.accessToken}` } }
            : undefined,
        });
        const client = new Client(
          { name: 'ai-trading-bot', version: '0.1.0' },
          { capabilities: {} },
        );
        await client.connect(transport);
        const { tools } = await client.listTools();
        this.toolNames = new Set(tools.map((t) => t.name));
        this.client = client;
      })();
    }
    await this.connecting;
    return this.client!;
  }

  private assertTool(name: string): void {
    if (this.toolNames.size > 0 && !this.toolNames.has(name)) {
      throw new Error(
        `Robinhood MCP server does not expose tool "${name}". Available: ${[...this.toolNames].join(', ')}`,
      );
    }
  }

  /** Call an MCP tool and parse the first text content block as JSON. */
  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.ensureConnected();
    this.assertTool(name);
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: unknown;
    };
    if (result.isError) {
      const text = this.textOf(result);
      throw new Error(`Robinhood MCP tool "${name}" returned an error: ${text}`);
    }
    const text = this.textOf(result);
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some tools may return plain text; wrap it.
      return text as unknown as T;
    }
  }

  private textOf(result: { content?: unknown }): string {
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    return content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.call<{ quotes?: Array<{ symbol: string; price: number }> }>(
      'get_equity_quotes',
      { symbols: [symbol] },
    );
    const q = data.quotes?.find((x) => x.symbol === symbol) ?? data.quotes?.[0];
    return { symbol, price: q?.price ?? 0, asOf: new Date().toISOString() };
  }

  async getPositions(): Promise<Position[]> {
    const data = await this.call<{
      positions?: Array<{
        symbol: string;
        quantity: number;
        average_price?: number;
        market_price?: number;
      }>;
    }>('get_equity_positions', {});
    return (data.positions ?? []).map((p) => {
      const avgPrice = p.average_price ?? 0;
      const marketPrice = p.market_price ?? avgPrice;
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        avgPrice,
        marketPrice,
        marketValue: Math.round(marketPrice * p.quantity * 100) / 100,
        unrealizedPnl: Math.round((marketPrice - avgPrice) * p.quantity * 100) / 100,
      };
    });
  }

  async getAccount(): Promise<AccountSnapshot> {
    const data = await this.call<{
      cash?: number;
      buying_power?: number;
      equity?: number;
      portfolio_value?: number;
    }>('get_portfolio', {});
    const positions = await this.getPositions();
    const cash = data.cash ?? 0;
    return {
      cash,
      equity: data.equity ?? data.portfolio_value ?? cash,
      buyingPower: data.buying_power ?? cash,
      positions,
    };
  }

  async previewOrder(req: OrderRequest): Promise<OrderPreview> {
    // Defense in depth: Robinhood's own pre-trade review, on top of our risk gate.
    const data = await this.call<{
      estimated_price?: number;
      estimated_cost?: number;
      warnings?: string[];
      approved?: boolean;
    }>('review_equity_order', {
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      type: req.limitPrice ? 'limit' : 'market',
      ...(req.limitPrice ? { limit_price: req.limitPrice } : {}),
    });
    const estimatedPrice = data.estimated_price ?? req.limitPrice ?? 0;
    const warnings = data.warnings ?? [];
    return {
      ok: data.approved ?? warnings.length === 0,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      estimatedPrice,
      estimatedCost: data.estimated_cost ?? Math.round(estimatedPrice * req.quantity * 100) / 100,
      warnings,
    };
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const data = await this.call<{
      order_id?: string;
      id?: string;
      status?: string;
      filled_price?: number;
    }>('place_equity_order', {
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      type: req.limitPrice ? 'limit' : 'market',
      ...(req.limitPrice ? { limit_price: req.limitPrice } : {}),
    });
    const orderId = data.order_id ?? data.id;
    return {
      ok: Boolean(orderId),
      orderId,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      filledPrice: data.filled_price,
      status: data.status === 'filled' ? 'filled' : 'accepted',
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    await this.call('cancel_equity_order', { order_id: orderId });
    return true;
  }

  async getActivity(): Promise<ActivityItem[]> {
    const data = await this.call<{
      orders?: Array<{
        id: string;
        symbol: string;
        side: string;
        quantity: number;
        price?: number;
        state?: string;
        created_at?: string;
      }>;
    }>('get_equity_orders', {});
    return (data.orders ?? []).map((o) => ({
      orderId: o.id,
      symbol: o.symbol,
      side: o.side as ActivityItem['side'],
      quantity: o.quantity,
      price: o.price ?? 0,
      status: o.state ?? 'unknown',
      at: o.created_at ?? new Date().toISOString(),
    }));
  }
}
