import { describe, it, expect } from 'vitest';
import { moveToCandidate } from './sentinel.js';
import { parseRssHeadlines, weeklyReturnPct } from './marketData.js';
import type { SymbolQuote } from './marketData.js';

const quote: SymbolQuote = { symbol: 'AAPL', price: 200, prevClose: 196, changePct: 2 };

const base = { quote, held: false, movePct: 0.03, timeframe: 'daily' as const };

describe('sentinel move detection', () => {
  it('ignores moves below the threshold', () => {
    expect(moveToCandidate({ ...base, returnPct: 1.5 })).toBeNull();
  });

  it('fires a buy on a large up move (momentum)', () => {
    const d = moveToCandidate({ ...base, returnPct: 4.2 });
    expect(d?.side).toBe('buy');
    expect(d?.condition).toMatch(/\+4\.2% daily/);
  });

  it('fires a sell on a large down move only when held', () => {
    expect(moveToCandidate({ ...base, returnPct: -5 })).toBeNull();
    expect(moveToCandidate({ ...base, returnPct: -5, held: true })?.side).toBe('sell');
  });

  it('uses a higher bar for the weekly timeframe', () => {
    // 5% clears a 3% daily bar but not a 7% weekly bar.
    expect(moveToCandidate({ ...base, returnPct: 5 })?.side).toBe('buy');
    expect(moveToCandidate({ ...base, returnPct: 5, movePct: 0.07, timeframe: 'weekly' })).toBeNull();
  });

  it('includes a headline in the condition when provided', () => {
    const d = moveToCandidate({ ...base, returnPct: 4, topHeadline: 'Apple beats earnings' });
    expect(d?.condition).toMatch(/Apple beats earnings/);
  });
});

describe('weeklyReturnPct', () => {
  it('computes the ~5-session return', () => {
    const closes = [100, 101, 102, 103, 104, 110]; // 6 closes: last vs 5 ago = +10%
    expect(weeklyReturnPct(closes)).toBeCloseTo(10, 5);
  });
  it('returns null without enough history', () => {
    expect(weeklyReturnPct([100, 101])).toBeNull();
  });
});

describe('RSS headline parsing', () => {
  it('extracts titles and links from an RSS feed', () => {
    const xml = `<rss><channel>
      <item><title>Big news for NVDA</title><link>https://x/1</link><pubDate>Tue, 24 Jun 2026 12:00:00 GMT</pubDate></item>
      <item><title><![CDATA[Chips rally &amp; more]]></title><link>https://x/2</link></item>
    </channel></rss>`;
    const items = parseRssHeadlines(xml, 'NVDA');
    expect(items).toHaveLength(2);
    expect(items[0].headline).toBe('Big news for NVDA');
    expect(items[1].headline).toBe('Chips rally & more');
    expect(items[0].url).toBe('https://x/1');
  });
});
