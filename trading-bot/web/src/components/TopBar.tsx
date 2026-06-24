import { postJSON, fmtUsd, type BotState } from '../api';

const adapterStyle: Record<string, string> = {
  SIM: 'bg-accent/20 text-accent border-accent/40',
  PAPER: 'bg-profit/15 text-profit border-profit/40',
  LIVE: 'bg-loss/20 text-loss border-loss/50',
};

export function TopBar({ state }: { state: BotState | null }) {
  const togglePause = async () => {
    if (!state) return;
    await postJSON('/api/pause', { paused: !state.paused });
  };

  return (
    <header className="flex items-center gap-4 px-4 h-14 border-b border-edge bg-panel">
      <div className="font-semibold tracking-tight">
        <span className="text-accent">◆</span> AI Trading Bot
      </div>

      {state ? (
        <>
          <Badge
            label="Adapter"
            value={state.adapter}
            className={adapterStyle[state.adapter] ?? ''}
          />
          <Badge
            label="State"
            value={state.paused ? 'Paused' : state.circuitBroken ? 'Circuit broken' : 'Running'}
            className={
              state.paused || state.circuitBroken
                ? 'bg-loss/20 text-loss border-loss/40'
                : 'bg-profit/15 text-profit border-profit/40'
            }
          />
          <Badge
            label="Horizon"
            value={state.timeframe === 'weekly' ? 'Weekly' : 'Daily'}
            className="bg-panel2 text-text border-edge capitalize"
          />
          <Badge
            label="Market"
            value={state.market.label}
            className={
              state.market.open
                ? 'bg-profit/15 text-profit border-profit/40'
                : 'bg-panel2 text-muted border-edge'
            }
          />
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-muted uppercase tracking-wide">Portfolio</div>
              <div className="font-semibold">{fmtUsd(state.portfolioValue ?? 0)}</div>
            </div>
            <button
              onClick={togglePause}
              className={`px-4 py-2 rounded-lg font-medium border transition-colors ${
                state.paused
                  ? 'bg-profit/20 text-profit border-profit/50 hover:bg-profit/30'
                  : 'bg-loss/20 text-loss border-loss/50 hover:bg-loss/30'
              }`}
            >
              {state.paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          </div>
        </>
      ) : (
        <span className="text-muted ml-2">connecting…</span>
      )}
    </header>
  );
}

function Badge({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`px-3 py-1 rounded-lg border text-sm ${className}`}>
      <span className="text-[11px] opacity-70 mr-1">{label}</span>
      {value}
    </div>
  );
}
