# WRKSight

A local-first, privacy-first desktop app that quietly tracks your digital work
and turns it into summaries, accomplishments, and goal-aligned insights. Think
of it as a personal career-growth and work-visibility tool — not surveillance.

**Status:** MVP scaffold. Core architecture, data model, normalization, privacy
controls, and UI are implemented. AI classification and summarization use a
mock provider by default; a real provider slot is ready to plug in.

---

## Why this exists

At the end of the day you were busy all day, but can't explain what you
actually worked on. WRKSight continuously captures light-weight activity
signals locally, groups them into meaningful sessions, and produces:

- end-of-day, weekly, and monthly summaries
- boss-ready and executive-ready updates
- self-review bullet points
- where your time went, and where it didn't
- how your time aligned (or didn't) with your stated professional goals
- an accumulating archive of accomplishments

## Privacy-first, by construction

- **No screenshots. No keystrokes.** Ever.
- Excluded apps and domains are filtered in the Rust layer **before** any row
  is written — they are never persisted, not even in debug logs.
- All data lives in a local SQLite file. No cloud, no telemetry.
- Pause tracking, private mode, and retention settings are first-class.
- AI calls (when you enable a real provider) only receive *normalized session
  metadata* (app name, window title, duration) — never raw event streams — and
  you can disable AI entirely.

---

## Stack

| Layer          | Choice                                |
| -------------- | ------------------------------------- |
| Shell          | **Tauri 2** (Rust core + webview UI)  |
| UI             | React 18 + TypeScript + Vite          |
| Styling        | Tailwind CSS                          |
| State          | Zustand                               |
| Database       | SQLite via `rusqlite` (Rust side)     |
| Window capture | `active-win-pos-rs` + platform shims  |
| Idle detection | `user-idle` crate                     |
| Charts         | Recharts                              |
| Tests          | Vitest (TS) + `cargo test` (Rust)     |

### Why Tauri over Electron for *this* app

This app is always-on. Tauri's memory/battery footprint (~40-80MB idle) beats
Electron's (~200-400MB), and Tauri's capability-based permission model is a
more honest match for a privacy-first product. Cross-platform active-window
detection is slightly less mature in Rust than in Node, so we abstract it
behind a trait with working macOS and Windows implementations and a dev
fallback on Linux.

---

## Running it

Prereqs: Node 20+, Rust 1.75+, platform deps for Tauri
([see Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm run tauri:dev      # desktop app
npm run dev            # UI-only in browser with a mock IPC layer
npm test               # Vitest
cd src-tauri && cargo test
```

On first run, the app creates `~/.wrksight/wrksight.db` and starts in **paused**
mode. Open Privacy → unpause to begin tracking.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the seven-layer design, the data
model, and extension points.

Short version:

```
UI ──IPC──> Commands ──> Services ──> Repository ──> SQLite
                 ▲
                 │
             Tracker loop (Rust) ──> Exclusions ──> Repository
```

---

## Project layout

```
WRKSight/
├── src/                    # React + TypeScript frontend
│   ├── types/              # shared data models (mirror the DB)
│   ├── lib/                # Tauri IPC wrapper, time/format helpers
│   ├── services/           # normalizer, classifier, summarizer, goals
│   │   └── ai/             # provider interface + mock + real stub
│   ├── stores/             # Zustand stores
│   ├── hooks/              # React hooks (useTracking, etc.)
│   ├── components/         # reusable UI
│   └── pages/              # Today, Week, Month, Projects, Goals, ...
├── src-tauri/              # Rust backend
│   └── src/
│       ├── capture/        # window + idle sampling, tracker loop
│       ├── db/             # schema, migrations, repo
│       ├── privacy/        # exclusion enforcement
│       ├── commands.rs     # Tauri command handlers exposed to UI
│       └── main.rs
└── tests/                  # end-to-end-ish integration tests (optional)
```

---

## What's implemented in this scaffold

- Complete data model with migrations
- Rust tracker loop abstraction + idle detection
- Pre-persist privacy filter (exclusions never hit disk)
- Normalization pipeline (flicker suppression, session merging, idle cuts)
- Classification pipeline with a pluggable AI provider interface + mock
- Summary pipeline (daily/weekly/monthly/boss-ready) with mock provider
- Goal alignment scoring
- Accomplishment candidate detection
- UI pages: Today, Week, Month, Projects, Accomplishments, Goals, Privacy,
  Settings
- Dashboard widgets: time by app / category / project, strategic-vs-reactive,
  focus vs fragmented, interruption count, uncategorized work, goal alignment
- Pause, private mode, retention, app and domain exclusions
- Vitest coverage for normalization, exclusions, classification parsing, goals

## What's explicitly mocked (and where to find it)

Every mock is marked with a `// MOCK:` comment. Grep for them.

- `src/services/ai/mockProvider.ts` — deterministic fake classifier/summarizer
- `src/services/ai/anthropicProvider.ts` — real provider stub; wire up a key in
  Settings to activate
- `src-tauri/src/capture/window.rs` — Linux path falls back to a dev stub when
  `WRKSIGHT_MOCK_CAPTURE=1`

## License

Personal use. Not for distribution.
