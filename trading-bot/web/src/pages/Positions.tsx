import { usePolled, fmtUsd, type Position, type JournalEntry } from '../api';

/**
 * AI thesis cards: each open position with the most recent decision's
 * conviction and how fresh that thesis is.
 */
export function Positions() {
  const positions = usePolled<Position[]>('/api/positions', 5000) ?? [];
  const journal = usePolled<JournalEntry[]>('/api/journal?limit=200', 8000) ?? [];

  const latestFor = (symbol: string) =>
    journal.find((j) => j.symbol === symbol && (j.outcome === 'routed' || j.action !== 'hold'));

  if (positions.length === 0) {
    return <div className="card p-8 text-center text-muted">No open positions.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {positions.map((p) => {
        const thesis = latestFor(p.symbol);
        const pnlPos = p.unrealizedPnl >= 0;
        return (
          <div key={p.symbol} className="card p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold">{p.symbol}</div>
              <div className={pnlPos ? 'text-profit' : 'text-loss'}>
                {pnlPos ? '+' : ''}
                {fmtUsd(p.unrealizedPnl)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
              <Field label="Qty" value={String(p.quantity)} />
              <Field label="Avg" value={fmtUsd(p.avgPrice)} />
              <Field label="Mkt" value={fmtUsd(p.marketPrice)} />
            </div>
            <div className="mt-3 text-sm">
              <span className="text-muted">Market value </span>
              {fmtUsd(p.marketValue)}
            </div>

            {thesis ? (
              <div className="mt-3 pt-3 border-t border-edge">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted text-xs uppercase tracking-wide">AI thesis</span>
                  <Conviction value={thesis.conviction} />
                </div>
                <p className="text-sm text-text/90 leading-snug">{thesis.reasoning}</p>
                <div className="text-xs text-muted mt-1">
                  {freshness(thesis.at)} · {thesis.source}
                </div>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-edge text-muted text-sm">
                No logged thesis yet for this position.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel2 rounded-lg px-2 py-1.5">
      <div className="text-[10px] text-muted uppercase">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Conviction({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? 'text-profit' : pct >= 50 ? 'text-accent' : 'text-muted';
  return <span className={`text-sm font-medium ${color}`}>{pct}% conviction</span>;
}

function freshness(at: string): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}
