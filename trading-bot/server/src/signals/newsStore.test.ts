import { describe, it, expect } from 'vitest';
import { addNews, getNews } from './newsStore.js';
import type { NewsItem } from './marketData.js';

const n = (symbol: string, headline: string, url: string, at: string): NewsItem => ({
  symbol,
  headline,
  url,
  source: 'test',
  at,
});

describe('news store', () => {
  it('dedupes by url, orders newest-first, and filters by symbol', () => {
    const added = addNews([
      n('AAPL', 'older', 'https://x/1', '2026-06-24T10:00:00Z'),
      n('NVDA', 'newer', 'https://x/2', '2026-06-24T12:00:00Z'),
    ]);
    expect(added).toHaveLength(2);

    // Duplicate URL is ignored.
    expect(addNews([n('AAPL', 'older', 'https://x/1', '2026-06-24T10:00:00Z')])).toHaveLength(0);

    const all = getNews();
    expect(all[0].headline).toBe('newer'); // newest first

    const aapl = getNews({ symbol: 'aapl' });
    expect(aapl.every((i) => i.symbol === 'AAPL')).toBe(true);
  });
});
