import type { NewsItem } from './marketData.js';

/**
 * In-memory ring buffer of recent headlines collected by the sentinel.
 * Deduped by URL (falling back to symbol+headline), newest first, capped.
 */
const MAX = 200;
let items: NewsItem[] = [];
const keys = new Set<string>();

const keyOf = (n: NewsItem) => n.url ?? `${n.symbol}:${n.headline}`;

/** Add freshly-fetched headlines; returns the ones that were new. */
export function addNews(incoming: NewsItem[]): NewsItem[] {
  const added: NewsItem[] = [];
  for (const n of incoming) {
    const k = keyOf(n);
    if (keys.has(k)) continue;
    keys.add(k);
    added.push(n);
  }
  if (added.length) {
    items = [...added, ...items]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, MAX);
    // Keep the dedupe set bounded to what's still retained.
    if (keys.size > MAX * 2) {
      keys.clear();
      for (const n of items) keys.add(keyOf(n));
    }
  }
  return added;
}

export function getNews(opts: { limit?: number; symbol?: string } = {}): NewsItem[] {
  const limit = Math.min(opts.limit ?? 100, MAX);
  const filtered = opts.symbol
    ? items.filter((n) => n.symbol === opts.symbol!.toUpperCase())
    : items;
  return filtered.slice(0, limit);
}
