import { usePolled, type JournalEntry } from '../api';

const outcomeStyle: Record<string, string> = {
  routed: 'bg-profit/15 text-profit border-profit/40',
  held: 'bg-panel2 text-muted border-edge',
  rejected_risk: 'bg-loss/15 text-loss border-loss/40',
  rejected_preview: 'bg-loss/15 text-loss border-loss/40',
  rejected_paused: 'bg-panel2 text-muted border-edge',
  error: 'bg-loss/20 text-loss border-loss/50',
};

export function Journal() {
  const entries = usePolled<JournalEntry[]>('/api/journal?limit=200', 6000) ?? [];

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className={`px-3 py-1 rounded-lg border text-sm ${outcomeStyle[k] ?? 'border-edge'}`}>
            {k.replace('_', ' ')}: <span className="font-semibold">{v}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-muted">No decisions logged yet (needs MongoDB connected).</div>
        )}
      </div>

      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e._id} className="card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{e.symbol}</span>
              <span className="text-muted text-sm">{e.side?.toUpperCase()}</span>
              <span className={`px-2 py-0.5 rounded text-xs border ${outcomeStyle[e.outcome] ?? 'border-edge'}`}>
                {e.outcome?.replace('_', ' ')}
              </span>
              <span className="text-xs text-muted">{e.source}</span>
              <span className="ml-auto text-sm">
                <span className="text-muted">conviction </span>
                <b>{Math.round((e.conviction ?? 0) * 100)}%</b>
                <span className="text-muted"> / {Math.round((e.threshold ?? 0) * 100)}%</span>
              </span>
            </div>
            <p className="text-sm mt-2 text-text/90 leading-snug">{e.reasoning}</p>
            {e.risks && <p className="text-xs text-loss/80 mt-1">Risk: {e.risks}</p>}
            {e.riskReasons?.length > 0 && (
              <p className="text-xs text-muted mt-1">{e.riskReasons.join(' · ')}</p>
            )}
            <div className="text-[11px] text-muted mt-1">{new Date(e.at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
