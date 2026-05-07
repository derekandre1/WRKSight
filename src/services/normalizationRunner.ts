/**
 * Normalization runner.
 *
 * The Rust tracker writes `raw_activity_events` continuously. The dashboard
 * reads `normalized_sessions`. This module is the bridge — the missing
 * step that broke the pipeline.
 *
 * Strategy:
 *   1. Pull the raw events for the requested range.
 *   2. Run the existing pure-function normalizer over them.
 *   3. Atomically replace the range's sessions in one Rust transaction
 *      via `replace_sessions_in_range` so the dashboard never reads a
 *      half-updated state.
 *
 * Idempotent — running it twice over the same range produces the same
 * normalized rows (subject to incoming raw events).
 *
 * Why client-side instead of a Rust background task: keeps the algorithm
 * in TS so it can evolve without rebuilding the binary, and it runs only
 * when the UI actually needs it.
 */

import { ipc } from "@/lib/tauri";
import type { Range } from "@/lib/time";
import type { SettingsMap } from "@/types";
import { DEFAULT_NORMALIZE_OPTIONS, normalize } from "./normalizer";

export interface NormalizationStats {
  raw_events: number;
  sessions_written: number;
  duration_ms: number;
}

export async function runNormalization(
  range: Range,
  settings?: SettingsMap
): Promise<NormalizationStats> {
  const t0 = performance.now();
  const raw = await ipc.listRawEvents(range.start, range.end);

  if (raw.length === 0) {
    // Still call replace so a previously-stale range gets cleared if the
    // user deleted all raw events.
    await ipc.replaceSessionsInRange(range.start, range.end, []);
    return {
      raw_events: 0,
      sessions_written: 0,
      duration_ms: performance.now() - t0,
    };
  }

  const opts = settings
    ? {
        ...DEFAULT_NORMALIZE_OPTIONS,
        idleThresholdMs: settings.idle_threshold_ms,
      }
    : DEFAULT_NORMALIZE_OPTIONS;

  const sessions = normalize(raw, opts);

  const written = await ipc.replaceSessionsInRange(
    range.start,
    range.end,
    sessions
  );

  return {
    raw_events: raw.length,
    sessions_written: written,
    duration_ms: performance.now() - t0,
  };
}
