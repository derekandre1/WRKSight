import { useState } from 'react';
import { usePolled, useFeed, type BotState } from './api';
import { TopBar } from './components/TopBar';
import { Overview } from './pages/Overview';
import { Positions } from './pages/Positions';
import { Journal } from './pages/Journal';
import { LiveFeed } from './pages/LiveFeed';
import { Settings } from './pages/Settings';

const TABS = ['Overview', 'Positions', 'Trade Journal', 'Live Feed', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  const state = usePolled<BotState>('/api/state', 4000);
  const feed = useFeed();

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar state={state} />

      <nav className="flex gap-1 px-4 py-2 border-b border-edge bg-base/60 sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'tab-btn-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {tab === 'Overview' && <Overview />}
        {tab === 'Positions' && <Positions />}
        {tab === 'Trade Journal' && <Journal />}
        {tab === 'Live Feed' && <LiveFeed feed={feed} />}
        {tab === 'Settings' && <Settings state={state} />}
      </main>
    </div>
  );
}
