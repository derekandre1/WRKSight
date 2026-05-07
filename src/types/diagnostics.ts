import type { NormalizedSession, RawActivityEvent } from "./activity";

/**
 * Live status surfaced on /diagnostics. Every field maps directly to a
 * Rust struct field — keep them in sync.
 */
export interface Diagnostics {
  paused: boolean;
  private_mode: boolean;
  platform: string;            // "windows" | "macos" | "linux"
  db_path: string;

  /** Wall-clock millis of the last tracker iteration, 0 if never. */
  last_tick_at: number;
  /** Wall-clock millis of the last successful capture, 0 if never. */
  last_capture_at: number;
  last_capture_error: string | null;

  last_raw_event: RawActivityEvent | null;
  latest_session: NormalizedSession | null;

  raw_count_today: number;
  session_count_today: number;
  raw_count_total: number;
  session_count_total: number;
}
