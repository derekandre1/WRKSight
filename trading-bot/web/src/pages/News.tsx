import { useMemo, useState } from 'react';
import { usePolled, type NewsItem } from '../api';

/**
 * Dedicated news panel: recent headlines the sentinel has collected, filterable
 * by symbol. Polls /api/news. Headlines also stream live under the Live Feed's
 * `news` filter; this view is the browsable archive.
 */
export function News() {
  const items = usePolled<NewsItem[]>('/api/news?limit=200', 15000) ?? [];
  const [symbol, setSymbol] = useState<string>('all');

  const symbols = useMemo(
    () => ['all', ...Array.from(new Set(items.map((n) => n.symbol))).sort()],
    [items],
  );
  const shown = symbol === 'all' ? items : items.filter((n) => n.symbol === symbol);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {symbols.map((s) => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`tab-btn text-sm ${symbol === s ? 'tab-btn-active' : ''}`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted self-center">{shown.length} headline(s)</span>
      </div>

      {shown.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          No headlines yet. The sentinel pulls news every 5 minutes for the watchlist.
          <div className="text-xs mt-2">
            If this stays empty, the market-data provider may be blocked from this host —
            set <code className="text-accent">FINNHUB_API_KEY</code> (see README).
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((n, i) => (
            <a
              key={(n.url ?? n.headline) + i}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className={`card p-3 flex items-start gap-3 hover:border-accent/50 transition-colors ${
                n.url ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="px-2 py-0.5 rounded bg-panel2 border border-edge text-xs font-medium shrink-0 mt-0.5">
                {n.symbol}
              </span>
              <div className="min-w-0">
                <div className="text-text/90 leading-snug">{n.headline}</div>
                <div className="text-xs text-muted mt-1">
                  {n.source ?? 'feed'} · {timeAgo(n.at)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(at: string): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
