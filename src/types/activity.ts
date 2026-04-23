/**
 * Data shapes shared between the Rust layer and the UI.
 *
 * Rust serializes these with `serde`, so field names must match exactly
 * (snake_case on the wire). We keep them snake_case on the TS side too so
 * there's no mismatch to chase across the IPC boundary.
 */

export interface RawActivityEvent {
  id: number | null;
  started_at: number;                // unix millis
  ended_at: number | null;
  app_name: string;
  window_title: string;
  browser_domain: string | null;
  is_idle: boolean;
  is_private_window: boolean;
  normalized: boolean;
}

export interface NormalizedSession {
  id: number | null;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  app_name: string;
  title_root: string;
  browser_domain: string | null;
  interruption_count: number;
  context_switch_count: number;
  source_event_ids_json: string;    // JSON string of number[]
  classified: boolean;
}

export function parseSourceEventIds(s: NormalizedSession): number[] {
  try {
    const v = JSON.parse(s.source_event_ids_json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}
