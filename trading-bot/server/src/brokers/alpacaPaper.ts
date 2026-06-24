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
 * Alpaca paper-trading sandbox adapter. Real API calls, no real money.
 * Equities only here (matching the rest of the bot).
 *
 * Docs: https://docs.alpaca.markets/ — trading API + data API.
 */
export class AlpacaPaperAdapter implements BrokerAdapter {
  readonly kind = 'PAPER' as const;
  readonly isLive = false;

  constructor(
    private readonly keyId: string,
    private readonly secretKey: string,
    private readonly baseUrl: string,
  ) {
    if (!keyId || !secretKey) {
      throw new Error('AlpacaPaperAdapter requires ALPACA_KEY_ID and ALPACA_SECRET_KEY.');
    }
  }

  private headers() {
    return {
      'APCA-API-KEY-ID': this.keyId,
      'APCA-API-SECRET-KEY': this.secretKey,
      'Content-Type': 'application/json',
    };
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca ${path} failed: ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    // Latest trade from the Alpaca data API.
    const data = await this.req<{ trade: { p: number; t: string } }>(
      `/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`.replace('/v2/stocks', '/v2/stocks'),
    ).catch(async () => {
      // Data lives on a different host; fall back to the data domain.
      const res = await fetch(
        `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`,
        { headers: this.headers() },
      );
      return (await res.json()) as { trade: { p: number; t: string } };
    });
    return { symbol, price: data.trade.p, asOf: data.trade.t };
  }

  async getPositions(): Promise<Position[]> {
    const raw = await this.req<
      Array<{
        symbol: string;
        qty: string;
        avg_entry_price: string;
        current_price: string;
        market_value: string;
        unrealized_pl: string;
      }>
    >('/v2/positions');
    return raw.map((p) => ({
      symbol: p.symbol,
      quantity: Number(p.qty),
      avgPrice: Number(p.avg_entry_price),
      marketPrice: Number(p.current_price),
      marketValue: Number(p.market_value),
      unrealizedPnl: Number(p.unrealized_pl),
    }));
  }

  async getAccount(): Promise<AccountSnapshot> {
    const a = await this.req<{ cash: string; equity: string; buying_power: string }>('/v2/account');
    const positions = await this.getPositions();
    return {
      cash: Number(a.cash),
      equity: Number(a.equity),
      buyingPower: Number(a.buying_power),
      positions,
    };
  }

  async previewOrder(req: OrderRequest): Promise<OrderPreview> {
    // Alpaca has no dedicated preview endpoint; estimate from the latest quote.
    const quote = await this.getQuote(req.symbol);
    const price = req.limitPrice ?? quote.price;
    return {
      ok: true,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      estimatedPrice: price,
      estimatedCost: Math.round(price * req.quantity * 100) / 100,
      warnings: [],
    };
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const body = {
      symbol: req.symbol,
      qty: req.quantity,
      side: req.side,
      type: req.limitPrice ? 'limit' : 'market',
      time_in_force: 'day',
      ...(req.limitPrice ? { limit_price: req.limitPrice } : {}),
    };
    const order = await this.req<{ id: string; status: string; filled_avg_price: string | null }>(
      '/v2/orders',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return {
      ok: true,
      orderId: order.id,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      filledPrice: order.filled_avg_price ? Number(order.filled_avg_price) : undefined,
      status: order.status === 'filled' ? 'filled' : 'accepted',
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    await this.req(`/v2/orders/${orderId}`, { method: 'DELETE' });
    return true;
  }

  async getActivity(): Promise<ActivityItem[]> {
    const orders = await this.req<
      Array<{
        id: string;
        symbol: string;
        side: string;
        qty: string;
        filled_avg_price: string | null;
        status: string;
        submitted_at: string;
      }>
    >('/v2/orders?status=all&limit=100');
    return orders.map((o) => ({
      orderId: o.id,
      symbol: o.symbol,
      side: o.side as ActivityItem['side'],
      quantity: Number(o.qty),
      price: o.filled_avg_price ? Number(o.filled_avg_price) : 0,
      status: o.status,
      at: o.submitted_at,
    }));
  }
}
