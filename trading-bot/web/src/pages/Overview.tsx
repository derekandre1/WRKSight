import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getJSON, fmtUsd } from '../api';

interface Metrics {
  decisions: number;
  routed: number;
  held: number;
  rejected: number;
  orders: number;
  byOutcome: Record<string, number>;
  account: { cash: number; equity: number } | null;
}

export function Overview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [series, setSeries] = useState<{ t: string; equity: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const m = await getJSON<Metrics>('/api/metrics');
        if (!alive) return;
        setMetrics(m);
        if (m.account) {
          setSeries((prev) =>
            [...prev, { t: new Date().toLocaleTimeString(), equity: m.account!.equity }].slice(-60),
          );
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const acct = metrics?.account;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Portfolio equity" value={acct ? fmtUsd(acct.equity) : '—'} />
        <Metric label="Cash" value={acct ? fmtUsd(acct.cash) : '—'} />
        <Metric label="Decisions logged" value={String(metrics?.decisions ?? 0)} />
        <Metric label="Orders placed" value={String(metrics?.orders ?? 0)} accent="profit" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric label="Routed" value={String(metrics?.routed ?? 0)} accent="profit" />
        <Metric label="Held" value={String(metrics?.held ?? 0)} />
        <Metric label="Rejected" value={String(metrics?.rejected ?? 0)} accent="loss" />
      </div>

      <div className="card p-4">
        <div className="text-muted text-sm mb-3">Equity (live, this session)</div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid stroke="#252c38" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: '#8b97a8', fontSize: 11 }} minTickGap={40} />
              <YAxis
                tick={{ fill: '#8b97a8', fontSize: 11 }}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              />
              <Tooltip
                contentStyle={{ background: '#141922', border: '1px solid #252c38', borderRadius: 8 }}
                formatter={(v: number) => fmtUsd(v)}
              />
              <Line type="monotone" dataKey="equity" stroke="#3ecf8e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {series.length < 2 && (
          <div className="text-muted text-xs mt-2">Collecting data points… (samples every 5s)</div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'profit' | 'loss' }) {
  const color = accent === 'profit' ? 'text-profit' : accent === 'loss' ? 'text-loss' : 'text-text';
  return (
    <div className="card p-4">
      <div className="text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
