import { randomUUID } from 'node:crypto';
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
 * Dry-run adapter: fake fills, deterministic-ish pseudo quotes, no external
 * calls. This is the DEFAULT until the operator explicitly switches to LIVE.
 *
 * State is kept in memory so the simulation survives within a process run.
 */
export class SimulationAdapter implements BrokerAdapter {
  readonly kind = 'SIM' as const;
  readonly isLive = false;

  private cash: number;
  private readonly startingCash: number;
  private positions = new Map<string, Position>();
  private activity: ActivityItem[] = [];
  private basePrices = new Map<string, number>();

  constructor(startingCash: number) {
    this.cash = startingCash;
    this.startingCash = startingCash;
  }

  /** A stable-but-jittered fake price per symbol. */
  private priceFor(symbol: string): number {
    let base = this.basePrices.get(symbol);
    if (base === undefined) {
      // Seed a base price from the symbol so it's stable across the run.
      let h = 0;
      for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 1000;
      base = 50 + (h % 450); // $50..$500
      this.basePrices.set(symbol, base);
    }
    // ±1.5% jitter so the dashboard shows movement.
    const jitter = 1 + (Math.random() - 0.5) * 0.03;
    return Math.round(base * jitter * 100) / 100;
  }

  async getQuote(symbol: string): Promise<Quote> {
    return { symbol, price: this.priceFor(symbol), asOf: new Date().toISOString() };
  }

  async getPositions(): Promise<Position[]> {
    return [...this.positions.values()].map((p) => {
      const marketPrice = this.priceFor(p.symbol);
      const marketValue = Math.round(marketPrice * p.quantity * 100) / 100;
      return {
        ...p,
        marketPrice,
        marketValue,
        unrealizedPnl: Math.round((marketPrice - p.avgPrice) * p.quantity * 100) / 100,
      };
    });
  }

  async getAccount(): Promise<AccountSnapshot> {
    const positions = await this.getPositions();
    const positionsValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const equity = Math.round((this.cash + positionsValue) * 100) / 100;
    return {
      cash: Math.round(this.cash * 100) / 100,
      equity,
      buyingPower: Math.round(this.cash * 100) / 100,
      positions,
    };
  }

  async previewOrder(req: OrderRequest): Promise<OrderPreview> {
    const price = req.limitPrice ?? this.priceFor(req.symbol);
    const estimatedCost = Math.round(price * req.quantity * 100) / 100;
    const warnings: string[] = [];
    if (req.side === 'buy' && estimatedCost > this.cash) {
      warnings.push('Insufficient simulated cash for this order.');
    }
    return {
      ok: warnings.length === 0,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      estimatedPrice: price,
      estimatedCost,
      warnings,
    };
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const price = req.limitPrice ?? this.priceFor(req.symbol);
    const orderId = randomUUID();

    if (req.side === 'buy') {
      const cost = price * req.quantity;
      if (cost > this.cash) {
        return {
          ok: false,
          symbol: req.symbol,
          side: req.side,
          quantity: req.quantity,
          status: 'rejected',
          message: 'Insufficient simulated cash.',
        };
      }
      this.cash -= cost;
      const existing = this.positions.get(req.symbol);
      if (existing) {
        const totalQty = existing.quantity + req.quantity;
        const avg = (existing.avgPrice * existing.quantity + price * req.quantity) / totalQty;
        existing.quantity = totalQty;
        existing.avgPrice = Math.round(avg * 100) / 100;
      } else {
        this.positions.set(req.symbol, {
          symbol: req.symbol,
          quantity: req.quantity,
          avgPrice: price,
          marketPrice: price,
          marketValue: Math.round(price * req.quantity * 100) / 100,
          unrealizedPnl: 0,
        });
      }
    } else {
      const existing = this.positions.get(req.symbol);
      const sellQty = Math.min(req.quantity, existing?.quantity ?? 0);
      if (!existing || sellQty <= 0) {
        return {
          ok: false,
          symbol: req.symbol,
          side: req.side,
          quantity: req.quantity,
          status: 'rejected',
          message: 'No simulated position to sell.',
        };
      }
      this.cash += price * sellQty;
      existing.quantity -= sellQty;
      if (existing.quantity <= 0) this.positions.delete(req.symbol);
    }

    const item: ActivityItem = {
      orderId,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      price,
      status: 'filled',
      at: new Date().toISOString(),
    };
    this.activity.unshift(item);

    return {
      ok: true,
      orderId,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      filledPrice: price,
      status: 'simulated',
      message: 'Simulated fill.',
    };
  }

  async cancelOrder(): Promise<boolean> {
    // Simulated orders fill instantly; nothing to cancel.
    return true;
  }

  async getActivity(): Promise<ActivityItem[]> {
    return this.activity.slice(0, 100);
  }
}
