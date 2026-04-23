# WRKSight — Architecture

## Seven layers

### 1. Activity Capture (Rust, `src-tauri/src/capture`)

A tokio task polls the OS on a configurable interval (default 5s) for:

- foreground application name
- foreground window title
- browser URL's registrable domain where available (via AppleScript on macOS,
  UIA on Windows — best-effort, never a hard requirement)
- idle state (from `user-idle`; threshold configurable, default 180s)

Each sample produces a `RawSample`. Samples are NOT persisted directly —
they pass through the Privacy layer first.

The capture module is abstracted behind a `trait WindowProvider` so it can be
swapped for a mock in tests or for a better platform-specific implementation
later.

### 2. Normalization (TypeScript, `src/services/normalizer.ts`)

Pure functions that turn raw samples into `NormalizedSession`s:

- **Flicker suppression** — drop sub-threshold switches (default <4s) that
  return to the prior app within a small window; they get attributed as
  *interruptions* to the surrounding session instead of becoming their own.
- **Session merging** — contiguous samples for the same (app, title-root)
  merge. Title-root = title with trailing dynamic bits (unread counts,
  timestamps) stripped.
- **Idle cuts** — any idle gap > idle threshold ends the current session.
- **Interruption counting** — tracked per session as `interruption_count` and
  `context_switch_count`.

Normalization runs periodically on unnormalized rows, so raw events are the
source of truth and the algorithm can be improved over time without data
loss.

### 3. Classification (TypeScript, `src/services/classifier.ts`)

Given a batch of sessions, produce `AiClassification` rows with:

- project (nullable)
- task (nullable)
- category (one of a user-editable enum: Strategic Planning, Execution,
  Email/Admin, Meetings, Professional Growth, Reactive/Fire Drills, Breaks,
  Unknown)
- strategic_score ∈ [0,1]
- reactive_score ∈ [0,1]
- confidence ∈ [0,1]

Backed by an `AiProvider` interface. The default is a deterministic **mock
provider** that uses keyword rules — good enough to demo the full pipeline
offline. A real `anthropicProvider` stub is included and activated by setting
an API key in Settings. Structured outputs are validated with Zod before
being trusted.

### 4. Insight (TypeScript, `src/services/insights.ts`)

Derived analytics over classified sessions:

- focus ratio (time in sessions > 20min / total)
- fragmentation index (sessions/hour weighted by short duration)
- top interruptions (most frequent interrupting apps)
- accomplishment candidates (sustained strategic sessions > threshold)
- goal alignment per goal

### 5. Summary (TypeScript, `src/services/summarizer.ts`)

Uses the `AiProvider` to generate:

- daily summary (end-of-day)
- weekly summary
- monthly summary
- boss-ready update (3-5 bullets, external voice)
- executive summary (1 paragraph, outcomes-focused)
- self-review bullets (accomplishment-oriented)

Every summary stores both the free-text and a structured JSON companion, so
the UI can render it consistently and future tools can query it.

### 6. UI (React)

Calm, scannable. Sidebar + content layout. No gamer aesthetics, no dark
surveillance reds. Pages:

- **Today** — timeline strip, time by app, time by category, strategic/reactive
  split, interruption count, end-of-day summary card.
- **This Week** — stacked trends, top projects, weekly narrative, boss-ready
  update.
- **This Month** — monthly narrative, executive summary, goal alignment.
- **Projects** — drill-down by project.
- **Accomplishments** — review/edit/save candidates into a permanent archive.
- **Goals** — CRUD goals, see how current time matches.
- **Privacy & Exclusions** — pause, private mode, retention, app/domain
  exclusions.
- **Settings** — capture interval, idle threshold, AI provider + key.

### 7. Privacy (Rust + TypeScript)

**The single rule:** excluded inputs are dropped in Rust before insert. The
frontend cannot and does not bypass this.

- `src-tauri/src/privacy/mod.rs` holds the exclusion check used by the tracker.
- `src/pages/Privacy.tsx` is the control surface.
- Pause state lives in the Rust tracker's atomic flag.
- Private mode is a stronger pause: also suppresses classifications of the
  window the user currently has focused, retroactively, when toggled on.
- Retention is enforced by a daily compaction task.

---

## Data model

All timestamps are ISO 8601 UTC strings in TS; `INTEGER` millis in SQLite.

### `raw_activity_events`

Continuously written by the tracker. Survivors of the privacy filter only.

| column            | type      | notes                            |
| ----------------- | --------- | -------------------------------- |
| id                | INTEGER   | PK                               |
| started_at        | INTEGER   | ms since epoch                   |
| ended_at          | INTEGER   | nullable until next sample       |
| app_name          | TEXT      |                                  |
| window_title      | TEXT      | may be truncated by privacy rule |
| browser_domain    | TEXT      | nullable                         |
| is_idle           | INTEGER   | 0/1                              |
| is_private_window | INTEGER   | 0/1                              |
| normalized        | INTEGER   | 0 until consumed by normalizer   |

### `normalized_sessions`

| column                 | type    | notes                       |
| ---------------------- | ------- | --------------------------- |
| id                     | INTEGER | PK                          |
| started_at             | INTEGER |                             |
| ended_at               | INTEGER |                             |
| duration_ms            | INTEGER |                             |
| app_name               | TEXT    |                             |
| title_root             | TEXT    | cleaned window title        |
| browser_domain         | TEXT    | nullable                    |
| interruption_count     | INTEGER |                             |
| context_switch_count   | INTEGER |                             |
| source_event_ids_json  | TEXT    | JSON array of raw ids       |
| classified             | INTEGER | 0 until consumed            |

### `ai_classifications`

| column           | type    | notes                           |
| ---------------- | ------- | ------------------------------- |
| id               | INTEGER | PK                              |
| session_id       | INTEGER | FK → normalized_sessions.id     |
| project          | TEXT    | nullable                        |
| task             | TEXT    | nullable                        |
| category         | TEXT    | enum                            |
| strategic_score  | REAL    | 0..1                            |
| reactive_score   | REAL    | 0..1                            |
| confidence       | REAL    | 0..1                            |
| model            | TEXT    | provider id                     |
| created_at       | INTEGER |                                 |

### `daily_summaries` / `weekly_summaries` / `monthly_summaries`

Same shape, different period key.

| column         | type    | notes                                  |
| -------------- | ------- | -------------------------------------- |
| id             | INTEGER | PK                                     |
| period_start   | INTEGER | start of day/ISO week/month in UTC ms  |
| period_end     | INTEGER |                                        |
| text           | TEXT    | human-readable summary                 |
| structured_json| TEXT    | validated structured summary           |
| variant        | TEXT    | 'standard' \| 'boss' \| 'executive' \| 'self_review' |
| model          | TEXT    |                                        |
| created_at     | INTEGER |                                        |

### `goals`

| column        | type    | notes                               |
| ------------- | ------- | ----------------------------------- |
| id            | INTEGER | PK                                  |
| label         | TEXT    | "Spend more time on strategic work" |
| direction     | TEXT    | 'increase' \| 'decrease'            |
| target_kind   | TEXT    | 'category' \| 'project' \| 'strategic' \| 'reactive' |
| target_value  | TEXT    | e.g. category name                  |
| target_hours  | REAL    | nullable weekly target              |
| active        | INTEGER | 0/1                                 |
| created_at    | INTEGER |                                     |

### `accomplishments`

| column          | type    | notes                        |
| --------------- | ------- | ---------------------------- |
| id              | INTEGER | PK                           |
| title           | TEXT    |                              |
| description     | TEXT    |                              |
| evidence_json   | TEXT    | related session ids + period |
| created_at      | INTEGER |                              |
| occurred_on     | INTEGER |                              |
| source          | TEXT    | 'ai_suggested' \| 'user'     |

### `exclusions`

| column | type    | notes                             |
| ------ | ------- | --------------------------------- |
| id     | INTEGER | PK                                |
| kind   | TEXT    | 'app' \| 'domain' \| 'title_glob' |
| value  | TEXT    | e.g. "1Password", "reddit.com"    |
| note   | TEXT    | nullable user note                |

### `app_settings`

Key-value store for: `tracking_paused`, `private_mode`, `capture_interval_ms`,
`idle_threshold_ms`, `retention_days`, `ai_provider`, `ai_api_key_encrypted`,
`last_normalized_at`, etc.

---

## Extensibility seams

- **`AiProvider`** (`src/services/ai/provider.ts`) — swap mock for real,
  add local LLM, add a self-hosted classifier.
- **`WindowProvider`** (`src-tauri/src/capture/window.rs`) — swap per platform
  or provide a better browser-URL shim.
- **`Insights`** — derived purely from `normalized_sessions` +
  `ai_classifications`, so new metrics don't require reprocessing raw events.
- **Summary variants** — adding a new variant is: add a template, add a
  button, add a row type.
