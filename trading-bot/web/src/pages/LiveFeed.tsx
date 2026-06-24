import { useState } from 'react';
import type { FeedEvent } from '../api';

const typeStyle: Record<string, string> = {
  webhook: 'text-accent',
  candidate: 'text-accent',
  decision: 'text-text',
  order: 'text-profit',
  risk: 'text-loss',
  news: 'text-amber-400',
  state: 'text-accent',
  error: 'text-loss',
  log: 'text-muted',
};

const FILTERS = ['all', 'webhook', 'candidate', 'news', 'decision', 'order', 'risk', 'error'] as const;

export function LiveFeed({ feed }: { feed: FeedEvent[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const shown = filter === 'all' ? feed : feed.filter((e) => e.type === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`tab-btn text-sm ${filter === f ? 'tab-btn-active' : ''}`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted self-center flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-profit animate-pulse" /> live (SSE)
        </span>
      </div>

      <div className="card divide-y divide-edge font-mono text-sm">
        {shown.length === 0 && <div className="p-4 text-muted">Waiting for events…</div>}
        {shown.map((e, i) => (
          <div key={i} className="px-3 py-2 flex gap-3">
            <span className="text-muted shrink-0">{new Date(e.at).toLocaleTimeString()}</span>
            <span className={`shrink-0 uppercase text-xs self-center ${typeStyle[e.type] ?? 'text-muted'}`}>
              {e.type}
            </span>
            <span className="text-text/90">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
