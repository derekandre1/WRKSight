/**
 * Normalization: raw samples -> clean sessions.
 *
 * Pure functions, no IPC, no side effects. This makes them trivial to test
 * and means the algorithm can be improved without losing historical data —
 * you can always re-run it over the raw table.
 */

import type { NormalizedSession, RawActivityEvent } from "@/types";

export interface NormalizeOptions {
  /** Events shorter than this are treated as flicker and folded into the
   *  surrounding session as an interruption. */
  flickerThresholdMs: number;
  /** Idle >= this ends the current session (must match Rust's tracker). */
  idleThresholdMs: number;
  /** When events are for the same app but titles differ, collapse them if
   *  their normalized title roots match. */
  titleRootCollapse: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  flickerThresholdMs: 4_000,
  idleThresholdMs: 180_000,
  titleRootCollapse: true,
};

/**
 * Strips dynamic suffixes/prefixes so we can coalesce the same logical
 * "thing the user is working on" across title updates. Extend with care —
 * every rule risks over-merging.
 */
export function titleRoot(title: string): string {
  let t = title.trim();
  // Leading unread counters like "(23) Inbox"
  t = t.replace(/^\(\d+\)\s+/, "");
  // Trailing app name after an em dash: "file.ts — VSCode"
  t = t.replace(/\s+[—-]\s+[^—-]+$/u, (match) => {
    // Keep if the suffix looks like a domain or contains a meaningful word
    return /\.[a-z]{2,}(?:$|\/)/.test(match) ? match : "";
  });
  return t.trim();
}

function endOf(e: RawActivityEvent): number {
  return e.ended_at ?? e.started_at;
}

function durationOf(e: RawActivityEvent): number {
  return Math.max(0, endOf(e) - e.started_at);
}

function sameAs(
  cur: { app_name: string; title: string; title_root: string; browser_domain: string | null },
  e: RawActivityEvent,
  opts: NormalizeOptions
): boolean {
  if (cur.app_name !== e.app_name) return false;
  if (cur.browser_domain !== e.browser_domain) return false;
  if (!opts.titleRootCollapse) return cur.title === e.window_title;
  return cur.title_root === titleRoot(e.window_title);
}

/**
 * Convert a chronologically ordered batch of raw events (within one logical
 * period — e.g. a day) into normalized sessions. Drops idle segments but
 * uses them as session boundaries.
 */
export function normalize(
  events: RawActivityEvent[],
  opts: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS
): NormalizedSession[] {
  if (events.length === 0) return [];

  // Filter out idle frames entirely — they shouldn't participate in sessions,
  // but they DO break sessions (handled below by the gap check).
  const active = events.filter((e) => !e.is_idle);
  if (active.length === 0) return [];

  type Working = {
    started_at: number;
    ended_at: number;
    app_name: string;
    title: string;
    title_root: string;
    browser_domain: string | null;
    interruption_count: number;
    context_switch_count: number;
    source_ids: number[];
  };
  const open = (e: RawActivityEvent): Working => ({
    started_at: e.started_at,
    ended_at: endOf(e),
    app_name: e.app_name,
    title: e.window_title,
    title_root: titleRoot(e.window_title),
    browser_domain: e.browser_domain,
    interruption_count: 0,
    context_switch_count: 0,
    source_ids: e.id != null ? [e.id] : [],
  });

  const out: Working[] = [];
  let cur: Working = open(active[0]);

  for (let i = 1; i < active.length; i++) {
    const e = active[i];
    const prev = active[i - 1];
    const gap = e.started_at - endOf(prev);
    const isFlicker = durationOf(e) < opts.flickerThresholdMs;
    const isIdleGap = gap >= opts.idleThresholdMs;

    // Large idle gap: flush current, start fresh.
    if (isIdleGap) {
      out.push(cur);
      cur = open(e);
      continue;
    }

    // Same activity: extend.
    if (sameAs(cur, e, opts)) {
      cur.ended_at = Math.max(cur.ended_at, endOf(e));
      if (e.id != null) cur.source_ids.push(e.id);
      continue;
    }

    // Short flicker away from current activity — count as interruption, don't
    // start a new session for it.
    if (isFlicker) {
      cur.interruption_count += 1;
      if (e.id != null) cur.source_ids.push(e.id);
      // The current session still "owns" the wall clock up to and through
      // this flicker — extend its end if needed.
      cur.ended_at = Math.max(cur.ended_at, endOf(e));
      continue;
    }

    // Genuine switch.
    cur.context_switch_count += 1;
    out.push(cur);
    cur = open(e);
    cur.context_switch_count += 1; // the new session was arrived at by a switch
  }
  out.push(cur);

  return out.map((w) => ({
    id: null,
    started_at: w.started_at,
    ended_at: w.ended_at,
    duration_ms: Math.max(0, w.ended_at - w.started_at),
    app_name: w.app_name,
    title_root: w.title_root,
    browser_domain: w.browser_domain,
    interruption_count: w.interruption_count,
    context_switch_count: w.context_switch_count,
    source_event_ids_json: JSON.stringify(w.source_ids),
    classified: false,
  }));
}
