import { describe, it, expect } from 'vitest';
import { moveToCandidate } from './sentinel.js';
import { parseRssHeadlines } from './marketData.js';
import type { SymbolQuote } from './marketData.js';

const quote = (changePct: number): SymbolQuote => ({
  symbol: 'AAPL',
  price: 200,
  prevClose: 200 / (1 + changePct / 100),
  changePct,
});

describe('sentinel move detection', () => {
  it('ignores moves below the threshold', () => {
    expect(moveToCandidate({ quote: quote(1.5), held: false, movePct: 0.03 })).toBeNull();
  });

  it('fires a buy on a large up move (momentum)', () => {
    const d = moveToCandidate({ quote: quote(4.2), held: false, movePct: 0.03 });
    expect(d?.side).toBe('buy');
    expect(d?.condition).toMatch(/\+4\.2%/);
  });

  it('fires a sell on a large down move only when held', () => {
    expect(moveToCandidate({ quote: quote(-5), held: false, movePct: 0.03 })).toBeNull();
    expect(moveToCandidate({ quote: quote(-5), held: true, movePct: 0.03 })?.side).toBe('sell');
  });

  it('includes a headline in the condition when provided', () => {
    const d = moveToCandidate({ quote: quote(4), held: false, movePct: 0.03, topHeadline: 'Apple beats earnings' });
    expect(d?.condition).toMatch(/Apple beats earnings/);
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
