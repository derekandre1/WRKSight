import { describe, it, expect } from "vitest";
import { normalize, titleRoot, DEFAULT_NORMALIZE_OPTIONS } from "./normalizer";
import type { RawActivityEvent } from "@/types";

function ev(
  id: number,
  startMin: number,
  durMin: number,
  app: string,
  title = "",
  opts: Partial<RawActivityEvent> = {}
): RawActivityEvent {
  const start = startMin * 60_000;
  return {
    id,
    started_at: start,
    ended_at: start + durMin * 60_000,
    app_name: app,
    window_title: title,
    browser_domain: null,
    is_idle: false,
    is_private_window: false,
    normalized: false,
    ...opts,
  };
}

describe("titleRoot", () => {
  it("strips leading unread counters", () => {
    expect(titleRoot("(23) Inbox")).toBe("Inbox");
  });

  it("strips trailing app-name suffix after em dash", () => {
    expect(titleRoot("file.ts — VSCode")).toBe("file.ts");
  });

  it("keeps a trailing domain suffix", () => {
    // Domains are meaningful context — don't strip them.
    expect(titleRoot("Issue #42 — github.com")).toBe("Issue #42 — github.com");
  });
});

describe("normalize", () => {
  it("returns an empty array when no events are given", () => {
    expect(normalize([])).toEqual([]);
  });

  it("merges contiguous same-app events into one session", () => {
    const events = [
      ev(1, 0, 10, "VSCode", "proj — main.ts"),
      ev(2, 10, 15, "VSCode", "proj — main.ts"),
      ev(3, 25, 5, "VSCode", "proj — main.ts"),
    ];
    const sessions = normalize(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].duration_ms).toBe(30 * 60_000);
    expect(JSON.parse(sessions[0].source_event_ids_json)).toEqual([1, 2, 3]);
  });

  it("cuts a session on an idle gap larger than the threshold", () => {
    const events = [
      ev(1, 0, 10, "VSCode", "doc"),
      ev(2, 60, 10, "VSCode", "doc"), // 50min gap > 3min idle threshold
    ];
    const out = normalize(events, {
      ...DEFAULT_NORMALIZE_OPTIONS,
      idleThresholdMs: 3 * 60_000,
    });
    expect(out).toHaveLength(2);
  });

  it("filters idle-flagged events entirely without splitting short idle gaps", () => {
    // 5min active, 2min idle, 5min active again — the 2min gap is below the
    // 3min idle threshold, so the filter semantic should merge into one session.
    const events = [
      ev(1, 0, 5, "VSCode", "doc"),
      ev(2, 5, 2, "VSCode", "doc", { is_idle: true }),
      ev(3, 7, 5, "VSCode", "doc"),
    ];
    const out = normalize(events, {
      ...DEFAULT_NORMALIZE_OPTIONS,
      idleThresholdMs: 3 * 60_000,
    });
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0].source_event_ids_json)).toEqual([1, 3]);
  });

  it("folds a short flicker away from the current activity as an interruption", () => {
    const events = [
      ev(1, 0, 10, "VSCode", "proj — main.ts"),
      ev(2, 10, 0.05, "Slack", "ping"), // ~3s flicker
      ev(3, 10.1, 9, "VSCode", "proj — main.ts"),
    ];
    const out = normalize(events);
    expect(out).toHaveLength(1);
    expect(out[0].interruption_count).toBeGreaterThanOrEqual(1);
  });

  it("counts a genuine switch as a context switch on both sides", () => {
    const events = [
      ev(1, 0, 20, "VSCode", "proj — main.ts"),
      ev(2, 20, 20, "Chrome", "github.com"),
    ];
    const out = normalize(events);
    expect(out).toHaveLength(2);
    expect(out[0].context_switch_count).toBe(1);
    expect(out[1].context_switch_count).toBe(1);
  });

  it("does not merge across different browser domains", () => {
    const events = [
      ev(1, 0, 10, "Chrome", "github.com", { browser_domain: "github.com" }),
      ev(2, 10, 10, "Chrome", "news.ycombinator.com", {
        browser_domain: "news.ycombinator.com",
      }),
    ];
    const out = normalize(events);
    expect(out).toHaveLength(2);
  });
});
