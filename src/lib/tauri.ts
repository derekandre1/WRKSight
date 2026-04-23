/**
 * Tauri IPC wrapper.
 *
 * In `npm run tauri:dev` the real `invoke` works. In plain `npm run dev`
 * (browser), there's no Tauri runtime, so we fall back to an in-memory mock
 * backed by `localStorage` so the UI is still exercisable.
 */

import type {
  Accomplishment,
  AiClassification,
  Exclusion,
  Goal,
  NormalizedSession,
  RawActivityEvent,
  Summary,
  PeriodKind,
} from "@/types";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invokeImpl: InvokeFn | null = null;

async function getInvoke(): Promise<InvokeFn> {
  if (invokeImpl) return invokeImpl;
  // The global is present when loaded inside a Tauri webview.
  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    invokeImpl = invoke as InvokeFn;
    return invokeImpl;
  }
  // Browser / test fallback. See mockBackend below.
  invokeImpl = mockInvoke;
  return invokeImpl;
}

/** Narrowly typed command wrappers. The UI should only call these. */
export const ipc = {
  getSettings: () => call<[string, string][]>("get_settings"),
  setSetting: (key: string, value: string) =>
    call<void>("set_setting", { key, value }),
  setTrackingPaused: (paused: boolean) =>
    call<void>("set_tracking_paused", { paused }),
  setPrivateMode: (priv: boolean) =>
    call<void>("set_private_mode", { private: priv }),

  listExclusions: () => call<Exclusion[]>("list_exclusions"),
  addExclusion: (kind: string, value: string, note?: string) =>
    call<number>("add_exclusion", { kind, value, note: note ?? null }),
  removeExclusion: (id: number) => call<void>("remove_exclusion", { id }),

  listRawEvents: (since: number, until: number) =>
    call<RawActivityEvent[]>("list_raw_events", { since, until }),
  listSessions: (since: number, until: number) =>
    call<NormalizedSession[]>("list_sessions", { since, until }),
  upsertSession: (session: NormalizedSession) =>
    call<number>("upsert_session", { session }),

  listClassifications: (since: number, until: number) =>
    call<AiClassification[]>("list_classifications", { since, until }),
  upsertClassification: (classification: AiClassification) =>
    call<number>("upsert_classification", { classification }),

  listSummaries: (period: PeriodKind, since: number, until: number) =>
    call<Summary[]>("list_summaries", { periodKind: period, since, until }),
  upsertSummary: (summary: Summary) =>
    call<number>("upsert_summary", { summary }),

  listGoals: () => call<Goal[]>("list_goals"),
  upsertGoal: (goal: Goal) => call<number>("upsert_goal", { goal }),
  deleteGoal: (id: number) => call<void>("delete_goal", { id }),

  listAccomplishments: () => call<Accomplishment[]>("list_accomplishments"),
  upsertAccomplishment: (a: Accomplishment) =>
    call<number>("upsert_accomplishment", { accomplishment: a }),
  deleteAccomplishment: (id: number) =>
    call<void>("delete_accomplishment", { id }),

  purgeRange: (since: number, until: number) =>
    call<number>("purge_range", { since, until }),
};

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = await getInvoke();
  return fn<T>(cmd, args);
}

// ------------------------------------------------------------------
// MOCK: Browser-mode backend. Only used outside Tauri (dev preview + tests).
// Data is persisted to localStorage so a page refresh doesn't wipe state.
// ------------------------------------------------------------------

type Table<T> = { rows: T[]; nextId: number };

interface Store {
  settings: Record<string, string>;
  exclusions: Table<Exclusion>;
  raw: Table<RawActivityEvent>;
  sessions: Table<NormalizedSession>;
  classifications: Table<AiClassification>;
  summaries: Table<Summary>;
  goals: Table<Goal>;
  accomplishments: Table<Accomplishment>;
}

const STORE_KEY = "wrksight.mockStore";

function emptyStore(): Store {
  return {
    settings: {
      tracking_paused: "true",
      private_mode: "false",
      capture_interval_ms: "5000",
      idle_threshold_ms: "180000",
      retention_days: "180",
      ai_provider: "mock",
      ai_api_key: "",
      last_normalized_at: "0",
    },
    exclusions: { rows: [], nextId: 1 },
    raw: { rows: [], nextId: 1 },
    sessions: { rows: [], nextId: 1 },
    classifications: { rows: [], nextId: 1 },
    summaries: { rows: [], nextId: 1 },
    goals: { rows: [], nextId: 1 },
    accomplishments: { rows: [], nextId: 1 },
  };
}

function loadStore(): Store {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedStore(emptyStore());
    return JSON.parse(raw) as Store;
  } catch {
    return seedStore(emptyStore());
  }
}

function saveStore(s: Store) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

/**
 * MOCK: seed browser-mode with a realistic half-day so the UI has something
 * to show on first load. Clearly marked so it's easy to strip later.
 */
function seedStore(s: Store): Store {
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(9, 0, 0, 0);
  let t = dayStart.getTime();
  const push = (app: string, title: string, durMin: number, domain: string | null = null) => {
    const dur = durMin * 60_000;
    s.raw.rows.push({
      id: s.raw.nextId++,
      started_at: t,
      ended_at: t + dur,
      app_name: app,
      window_title: title,
      browser_domain: domain,
      is_idle: false,
      is_private_window: false,
      normalized: true,
    });
    s.sessions.rows.push({
      id: s.sessions.nextId++,
      started_at: t,
      ended_at: t + dur,
      duration_ms: dur,
      app_name: app,
      title_root: title,
      browser_domain: domain,
      interruption_count: Math.max(0, Math.round(durMin / 15) - 1),
      context_switch_count: 0,
      source_event_ids_json: "[]",
      classified: false,
    });
    t += dur;
  };

  push("VSCode", "wrksight — designing schema", 55);
  push("Chrome", "Tauri docs — tauri.app", 12, "tauri.app");
  push("Slack", "#team-platform", 18);
  push("Mail", "Inbox", 22);
  push("Zoom", "Weekly planning", 45);
  push("VSCode", "wrksight — normalizer impl", 72);
  push("Chrome", "GitHub — issue #42 — github.com", 9, "github.com");
  push("Notion", "Q2 OKRs", 30);
  push("Slack", "DMs", 14);
  push("Chrome", "HN", 8, "news.ycombinator.com");

  // A prebuilt goal so the Goals page has something to render.
  s.goals.rows.push({
    id: s.goals.nextId++,
    label: "Spend at least 10h/week on strategic work",
    direction: "increase",
    target_kind: "strategic",
    target_value: null,
    target_hours: 10,
    active: true,
    created_at: now,
  });
  s.goals.rows.push({
    id: s.goals.nextId++,
    label: "Keep email/admin under 5h/week",
    direction: "decrease",
    target_kind: "category",
    target_value: "Email/Admin",
    target_hours: 5,
    active: true,
    created_at: now,
  });

  saveStore(s);
  return s;
}

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const s = loadStore();
  const result = handleMock(s, cmd, args ?? {});
  saveStore(s);
  return result as T;
}

function handleMock(
  s: Store,
  cmd: string,
  args: Record<string, unknown>
): unknown {
  const now = Date.now();
  switch (cmd) {
    case "get_settings":
      return Object.entries(s.settings);
    case "set_setting":
      s.settings[args.key as string] = args.value as string;
      return undefined;
    case "set_tracking_paused":
      s.settings.tracking_paused = args.paused ? "true" : "false";
      return undefined;
    case "set_private_mode":
      s.settings.private_mode = args.private ? "true" : "false";
      return undefined;
    case "list_exclusions":
      return [...s.exclusions.rows];
    case "add_exclusion": {
      const row: Exclusion = {
        id: s.exclusions.nextId++,
        kind: args.kind as Exclusion["kind"],
        value: args.value as string,
        note: (args.note as string | null) ?? null,
      };
      if (!s.exclusions.rows.some((r) => r.kind === row.kind && r.value === row.value)) {
        s.exclusions.rows.push(row);
      }
      return row.id;
    }
    case "remove_exclusion":
      s.exclusions.rows = s.exclusions.rows.filter((r) => r.id !== args.id);
      return undefined;
    case "list_raw_events":
      return s.raw.rows.filter(
        (r) => r.started_at >= (args.since as number) && r.started_at < (args.until as number)
      );
    case "list_sessions":
      return s.sessions.rows.filter(
        (r) => r.started_at >= (args.since as number) && r.started_at < (args.until as number)
      );
    case "upsert_session": {
      const row = args.session as NormalizedSession;
      if (row.id) {
        const i = s.sessions.rows.findIndex((r) => r.id === row.id);
        if (i >= 0) s.sessions.rows[i] = row;
        return row.id;
      }
      const id = s.sessions.nextId++;
      s.sessions.rows.push({ ...row, id });
      return id;
    }
    case "list_classifications":
      return s.classifications.rows.filter((c) => {
        const sess = s.sessions.rows.find((r) => r.id === c.session_id);
        if (!sess) return false;
        return sess.started_at >= (args.since as number) && sess.started_at < (args.until as number);
      });
    case "upsert_classification": {
      const row = args.classification as AiClassification;
      row.created_at = row.created_at || now;
      const i = s.classifications.rows.findIndex((c) => c.session_id === row.session_id);
      if (i >= 0) s.classifications.rows[i] = { ...row, id: s.classifications.rows[i].id };
      else s.classifications.rows.push({ ...row, id: s.classifications.nextId++ });
      const sess = s.sessions.rows.find((r) => r.id === row.session_id);
      if (sess) sess.classified = true;
      return row.id ?? 0;
    }
    case "list_summaries":
      return s.summaries.rows.filter(
        (r) =>
          r.period_kind === (args.periodKind as string) &&
          r.period_start >= (args.since as number) &&
          r.period_start < (args.until as number)
      );
    case "upsert_summary": {
      const row = args.summary as Summary;
      row.created_at = row.created_at || now;
      const i = s.summaries.rows.findIndex(
        (r) =>
          r.period_kind === row.period_kind &&
          r.period_start === row.period_start &&
          r.variant === row.variant
      );
      if (i >= 0) s.summaries.rows[i] = { ...row, id: s.summaries.rows[i].id };
      else s.summaries.rows.push({ ...row, id: s.summaries.nextId++ });
      return row.id ?? 0;
    }
    case "list_goals":
      return [...s.goals.rows];
    case "upsert_goal": {
      const row = args.goal as Goal;
      row.created_at = row.created_at || now;
      if (row.id) {
        const i = s.goals.rows.findIndex((r) => r.id === row.id);
        if (i >= 0) s.goals.rows[i] = row;
        return row.id;
      }
      const id = s.goals.nextId++;
      s.goals.rows.push({ ...row, id });
      return id;
    }
    case "delete_goal":
      s.goals.rows = s.goals.rows.filter((r) => r.id !== args.id);
      return undefined;
    case "list_accomplishments":
      return [...s.accomplishments.rows];
    case "upsert_accomplishment": {
      const row = args.accomplishment as Accomplishment;
      row.created_at = row.created_at || now;
      if (row.id) {
        const i = s.accomplishments.rows.findIndex((r) => r.id === row.id);
        if (i >= 0) s.accomplishments.rows[i] = row;
        return row.id;
      }
      const id = s.accomplishments.nextId++;
      s.accomplishments.rows.push({ ...row, id });
      return id;
    }
    case "delete_accomplishment":
      s.accomplishments.rows = s.accomplishments.rows.filter((r) => r.id !== args.id);
      return undefined;
    case "purge_range": {
      const before = s.raw.rows.length + s.sessions.rows.length;
      s.raw.rows = s.raw.rows.filter(
        (r) => !(r.started_at >= (args.since as number) && r.started_at < (args.until as number))
      );
      s.sessions.rows = s.sessions.rows.filter(
        (r) => !(r.started_at >= (args.since as number) && r.started_at < (args.until as number))
      );
      return before - (s.raw.rows.length + s.sessions.rows.length);
    }
    default:
      throw new Error(`mockInvoke: unknown command ${cmd}`);
  }
}

/** Exposed for tests to reset the mock store deterministically. */
export function __resetMockStore() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORE_KEY);
  invokeImpl = null;
}
