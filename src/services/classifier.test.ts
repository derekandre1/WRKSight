import { describe, it, expect } from "vitest";
import { ClassificationSchema } from "@/types/classification";
import { MockAiProvider } from "./ai/mockProvider";
import { classifySessions, safeFallback } from "./classifier";
import type { NormalizedSession } from "@/types";

function session(overrides: Partial<NormalizedSession> = {}): NormalizedSession {
  return {
    id: 1,
    started_at: 0,
    ended_at: 30 * 60_000,
    duration_ms: 30 * 60_000,
    app_name: "VSCode",
    title_root: "wrksight — main.rs",
    browser_domain: null,
    interruption_count: 0,
    context_switch_count: 0,
    source_event_ids_json: "[]",
    classified: false,
    ...overrides,
  };
}

describe("ClassificationSchema", () => {
  it("accepts a well-formed classification", () => {
    const ok = ClassificationSchema.safeParse({
      project: "wrksight",
      task: "rust work",
      category: "Execution",
      strategic_score: 0.7,
      reactive_score: 0.2,
      confidence: 0.8,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown category", () => {
    const bad = ClassificationSchema.safeParse({
      project: null,
      task: null,
      category: "Procrastination",
      strategic_score: 0.5,
      reactive_score: 0.5,
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects scores outside [0,1]", () => {
    const bad = ClassificationSchema.safeParse({
      project: null,
      task: null,
      category: "Execution",
      strategic_score: 1.5,
      reactive_score: 0.5,
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });
});

describe("MockAiProvider.classifyBatch", () => {
  it("classifies an editor session as Execution with non-trivial strategic score", async () => {
    const p = new MockAiProvider();
    const [c] = await p.classifyBatch([session()]);
    expect(c.category).toBe("Execution");
    expect(c.strategic_score).toBeGreaterThan(0);
  });

  it("classifies a Slack session with high reactive score", async () => {
    const p = new MockAiProvider();
    const [c] = await p.classifyBatch([
      session({ app_name: "Slack", title_root: "#team-platform" }),
    ]);
    expect(c.category).toMatch(/Reactive|Meetings/);
    expect(c.reactive_score).toBeGreaterThan(0.5);
  });

  it("short sessions skew less strategic than long ones", async () => {
    const p = new MockAiProvider();
    const short = await p.classifyBatch([
      session({ duration_ms: 2 * 60_000 }),
    ]);
    const long = await p.classifyBatch([
      session({ duration_ms: 45 * 60_000, interruption_count: 0 }),
    ]);
    expect(long[0].strategic_score).toBeGreaterThan(short[0].strategic_score);
  });
});

describe("classifySessions integration (mock backend)", () => {
  it("persists classifications and returns valid=true for every session", async () => {
    const p = new MockAiProvider();
    const res = await classifySessions(
      [session({ id: 1 }), session({ id: 2, app_name: "Mail", title_root: "Inbox" })],
      p
    );
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.valid)).toBe(true);
  });
});

describe("safeFallback", () => {
  it("produces a valid ClassificationFields", () => {
    const f = safeFallback();
    expect(ClassificationSchema.safeParse(f).success).toBe(true);
  });
});
