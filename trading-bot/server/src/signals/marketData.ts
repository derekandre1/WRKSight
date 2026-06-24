import { config } from '../config.js';
import { bus } from '../feed/bus.js';

/** A quote with enough context to compute an intraday move. */
export interface SymbolQuote {
  symbol: string;
  price: number;
  prevClose: number;
  /** Intraday change vs previous close, in percent (e.g. 3.2 = +3.2%). */
  changePct: number;
}

export interface NewsItem {
  symbol: string;
  headline: string;
  url?: string;
  source?: string;
  at: string; // ISO
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<SymbolQuote | null>;
  getNews(symbol: string): Promise<NewsItem[]>;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ai-trading-bot/0.1)' };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/**
 * Finnhub.io — clean JSON for quotes and company news. Used when
 * FINNHUB_API_KEY is set. Free tier is plenty for a small watchlist.
 */
export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';
  constructor(private readonly apiKey: string) {}

  async getQuote(symbol: string): Promise<SymbolQuote | null> {
    const q = await fetchJson<{ c: number; pc: number; dp: number }>(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`,
    );
    if (!q || !q.c) return null;
    const changePct = Number.isFinite(q.dp) ? q.dp : q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0;
    return { symbol, price: q.c, prevClose: q.pc, changePct };
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    const to = new Date();
    const from = new Date(to.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const items = await fetchJson<
      Array<{ headline: string; url: string; source: string; datetime: number }>
    >(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${this.apiKey}`,
    );
    return (items ?? []).slice(0, 5).map((n) => ({
      symbol,
      headline: n.headline,
      url: n.url,
      source: n.source,
      at: new Date(n.datetime * 1000).toISOString(),
    }));
  }
}

/**
 * Keyless fallback using Yahoo Finance's public endpoints:
 *  - quotes via the v8 chart meta (regularMarketPrice + previousClose)
 *  - news via the per-symbol RSS headline feed
 * No API key required; best-effort (Yahoo may rate-limit).
 */
export class YahooProvider implements MarketDataProvider {
  readonly name = 'yahoo';

  async getQuote(symbol: string): Promise<SymbolQuote | null> {
    const data = await fetchJson<{
      chart: {
        result?: Array<{
          meta: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number };
        }>;
      };
    }>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    );
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return { symbol, price, prevClose, changePct };
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    const res = await fetch(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
      { headers: UA },
    );
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssHeadlines(xml, symbol).slice(0, 5);
  }
}

/** Minimal RSS <item> parser — enough for title/link/pubDate, no XML dep. */
export function parseRssHeadlines(xml: string, symbol: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = pick(block, 'title');
    if (!title) continue;
    items.push({
      symbol,
      headline: decodeXml(title),
      url: pick(block, 'link') ?? undefined,
      source: 'yahoo',
      at: pick(block, 'pubDate') ? new Date(pick(block, 'pubDate')!).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

function pick(block: string, tag: string): string | null {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(block);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return plain ? plain[1].trim() : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

let provider: MarketDataProvider | null = null;

/** The active market-data provider, chosen by config (Finnhub key -> Finnhub, else Yahoo). */
export function marketData(): MarketDataProvider {
  if (!provider) {
    provider = config.finnhubApiKey ? new FinnhubProvider(config.finnhubApiKey) : new YahooProvider();
    bus.emitEvent('log', `Market-data provider: ${provider.name}.`);
  }
  return provider;
}
