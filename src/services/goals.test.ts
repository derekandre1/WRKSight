import { describe, it, expect } from "vitest";
import { alignAll, alignForGoal, hoursForGoal, statusForGoal } from "./goals";
import type { Goal } from "@/types/goal";
import type { SessionWithClassification } from "./insights";

function sess(
  durationH: number,
  overrides: Partial<SessionWithClassification["classification"]> = {}
): SessionWithClassification {
  return {
    id: 1,
    started_at: 0,
    ended_at: durationH * 3_600_000,
    duration_ms: durationH * 3_600_000,
    app_name: "VSCode",
    title_root: "",
    browser_domain: null,
    interruption_count: 0,
    context_switch_count: 0,
    source_event_ids_json: "[]",
    classified: true,
    classification: {
      project: null,
      task: null,
      category: "Execution",
      strategic_score: 0.7,
      reactive_score: 0.2,
      confidence: 0.8,
      ...overrides,
    },
  };
}

const strategicGoal: Goal = {
  id: 1,
  label: "10h/week strategic",
  direction: "increase",
  target_kind: "strategic",
  target_value: null,
  target_hours: 10,
  active: true,
  created_at: 0,
};

const emailCap: Goal = {
  id: 2,
  label: "Email under 5h/week",
  direction: "decrease",
  target_kind: "category",
  target_value: "Email/Admin",
  target_hours: 5,
  active: true,
  created_at: 0,
};

describe("hoursForGoal", () => {
  it("sums strategic hours weighted by strategic_score", () => {
    const sessions = [sess(5, { strategic_score: 0.8 }), sess(5, { strategic_score: 0.2 })];
    expect(hoursForGoal(strategicGoal, sessions)).toBeCloseTo(5, 5);
  });

  it("sums category hours only when category matches", () => {
    const sessions = [
      sess(2, { category: "Email/Admin" }),
      sess(3, { category: "Execution" }),
    ];
    expect(hoursForGoal(emailCap, sessions)).toBeCloseTo(2, 5);
  });
});

describe("statusForGoal", () => {
  it("marks increase goals ahead when actual meets target", () => {
    expect(statusForGoal(strategicGoal, 11)).toBe("ahead");
  });
  it("marks increase goals on_track within 20% of target", () => {
    expect(statusForGoal(strategicGoal, 9)).toBe("on_track");
  });
  it("marks increase goals behind when far under", () => {
    expect(statusForGoal(strategicGoal, 2)).toBe("behind");
  });
  it("marks decrease goals on_track under the cap", () => {
    expect(statusForGoal(emailCap, 4)).toBe("on_track");
  });
  it("returns unknown when no target is set", () => {
    expect(
      statusForGoal({ ...strategicGoal, target_hours: null }, 100)
    ).toBe("unknown");
  });
});

describe("alignForGoal / alignAll", () => {
  it("aligns a strategic goal end-to-end", () => {
    const sessions = [sess(8, { strategic_score: 1 }), sess(4, { strategic_score: 1 })];
    const r = alignForGoal(strategicGoal, sessions);
    expect(r.status).toBe("ahead");
    expect(r.actual_hours).toBeGreaterThanOrEqual(10);
  });

  it("skips inactive goals", () => {
    const sessions = [sess(10, { strategic_score: 1 })];
    const res = alignAll([{ ...strategicGoal, active: false }], sessions);
    expect(res).toHaveLength(0);
  });
});
