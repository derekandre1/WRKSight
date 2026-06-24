import { useEffect, useState } from 'react';
import { postJSON, type BotState } from '../api';

export function Settings({ state }: { state: BotState | null }) {
  const [risk, setRisk] = useState(state?.risk);
  const [watchlist, setWatchlist] = useState(state?.watchlist.join(', ') ?? '');
  const [saved, setSaved] = useState('');

  // Seed the watchlist once.
  useEffect(() => {
    if (state && watchlist === '') setWatchlist(state.watchlist.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // (Re)seed the risk form whenever the active profile changes — including when
  // the timeframe is switched, which activates that timeframe's profile.
  useEffect(() => {
    if (state) setRisk(state.risk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.timeframe]);

  if (!state || !risk) return <div className="text-muted">Loading…</div>;

  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(''), 2000);
  };

  const saveRisk = async () => {
    await postJSON('/api/risk', {
      maxExposurePct: risk.maxExposurePct,
      maxTradePct: risk.maxTradePct,
      dailyLossLimitPct: risk.dailyLossLimitPct,
      convictionThreshold: risk.convictionThreshold,
      tradeCooldownMs: risk.tradeCooldownMs,
      riskPerTradePct: risk.riskPerTradePct,
      stopLossPct: risk.stopLossPct,
    });
    flash(`Risk settings saved (${state.timeframe} profile).`);
  };

  const saveWatchlist = async () => {
    await postJSON('/api/watchlist', {
      watchlist: watchlist.split(',').map((s) => s.trim()).filter(Boolean),
    });
    flash('Watchlist saved.');
  };

  const switchTimeframe = async (timeframe: 'daily' | 'weekly') => {
    await postJSON('/api/timeframe', { timeframe });
    flash(`Trading horizon set to ${timeframe}.`);
  };

  const switchAdapter = async (adapter: 'SIM' | 'PAPER' | 'LIVE') => {
    if (adapter === 'LIVE') {
      const ok = window.confirm(
        'Switch to LIVE? This connects to your Robinhood agentic account and real orders become possible. ' +
          'Every order still passes the risk gate and Robinhood preview. Continue?',
      );
      if (!ok) return;
    }
    await postJSON('/api/adapter', { adapter });
    flash(`Adapter switched to ${adapter}.`);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {saved && <div className="card p-2 px-3 text-profit border-profit/40">{saved}</div>}

      {/* Adapter selection */}
      <section className="card p-4">
        <h2 className="font-semibold mb-1">Broker adapter</h2>
        <p className="text-muted text-sm mb-3">
          Starts in SIM. LIVE is never entered without an explicit confirmation.
        </p>
        <div className="flex gap-2">
          {(['SIM', 'PAPER', 'LIVE'] as const).map((a) => (
            <button
              key={a}
              onClick={() => switchAdapter(a)}
              className={`px-4 py-2 rounded-lg border font-medium ${
                state.adapter === a
                  ? a === 'LIVE'
                    ? 'bg-loss/20 text-loss border-loss/50'
                    : 'bg-accent/20 text-accent border-accent/50'
                  : 'border-edge text-muted hover:text-text'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </section>

      {/* Trading horizon */}
      <section className="card p-4">
        <h2 className="font-semibold mb-1">Trading horizon</h2>
        <p className="text-muted text-sm mb-3">
          Daily/weekly swing &amp; position trading. Drives the sentinel's move
          thresholds and how the decision engine reasons.
        </p>
        <div className="flex gap-2">
          {(['daily', 'weekly'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => switchTimeframe(tf)}
              className={`px-4 py-2 rounded-lg border font-medium capitalize ${
                state.timeframe === tf
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-edge text-muted hover:text-text'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </section>

      {/* Risk tuning */}
      <section className="card p-4">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-semibold">Risk rules</h2>
          <span className="text-xs text-muted capitalize">{state.timeframe} profile</span>
        </div>
        <p className="text-muted text-sm mb-3">
          Position size is the most constraining of: fixed-fractional risk
          (risk-per-trade ÷ stop distance), the per-trade cap, exposure headroom,
          and buying power. A wider stop ⇒ smaller size for the same dollar risk.
          Edits apply to the active timeframe's profile.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Pct label="Risk per trade" value={risk.riskPerTradePct} onChange={(v) => setRisk({ ...risk, riskPerTradePct: v })} />
          <Pct label="Stop loss" value={risk.stopLossPct} onChange={(v) => setRisk({ ...risk, stopLossPct: v })} />
          <Pct label="Max exposure" value={risk.maxExposurePct} onChange={(v) => setRisk({ ...risk, maxExposurePct: v })} />
          <Pct label="Max trade size" value={risk.maxTradePct} onChange={(v) => setRisk({ ...risk, maxTradePct: v })} />
          <Pct label="Daily loss limit" value={risk.dailyLossLimitPct} onChange={(v) => setRisk({ ...risk, dailyLossLimitPct: v })} />
          <Pct label="Conviction threshold" value={risk.convictionThreshold} onChange={(v) => setRisk({ ...risk, convictionThreshold: v })} />
          <Field
            label="Trade cooldown (min)"
            value={String(Math.round(risk.tradeCooldownMs / 60000))}
            onChange={(v) => setRisk({ ...risk, tradeCooldownMs: Number(v) * 60000 })}
          />
        </div>
        <button onClick={saveRisk} className="mt-3 px-4 py-2 rounded-lg bg-accent/20 text-accent border border-accent/50">
          Save risk rules
        </button>
      </section>

      {/* Watchlist */}
      <section className="card p-4">
        <h2 className="font-semibold mb-2">Watchlist</h2>
        <input
          className="w-full bg-panel2 border border-edge rounded-lg px-3 py-2"
          value={watchlist}
          onChange={(e) => setWatchlist(e.target.value)}
          placeholder="AAPL, MSFT, NVDA"
        />
        <button onClick={saveWatchlist} className="mt-3 px-4 py-2 rounded-lg bg-accent/20 text-accent border border-accent/50">
          Save watchlist
        </button>
      </section>

      <ManualCandidate onDone={() => flash('Candidate submitted to pipeline.')} />
    </div>
  );
}

function ManualCandidate({ onDone }: { onDone: () => void }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const submit = async () => {
    await postJSON('/api/candidate', { symbol, side, condition: 'Manual test from dashboard' });
    onDone();
  };
  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-1">Test the pipeline</h2>
      <p className="text-muted text-sm mb-3">
        Inject a candidate manually — runs the full decision → risk → order path.
      </p>
      <div className="flex gap-2">
        <input
          className="bg-panel2 border border-edge rounded-lg px-3 py-2 w-32"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
        <select
          className="bg-panel2 border border-edge rounded-lg px-3 py-2"
          value={side}
          onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
        >
          <option value="buy">buy</option>
          <option value="sell">sell</option>
        </select>
        <button onClick={submit} className="px-4 py-2 rounded-lg bg-profit/20 text-profit border border-profit/50">
          Submit candidate
        </button>
      </div>
    </section>
  );
}

function Pct({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field
      label={`${label} (%)`}
      value={String(Math.round(value * 100))}
      onChange={(v) => onChange(Number(v) / 100)}
    />
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <input
        type="number"
        className="w-full bg-panel2 border border-edge rounded-lg px-3 py-2 mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
