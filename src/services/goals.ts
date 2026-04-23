/**
 * Goal alignment scoring.
 *
 * Works off the same classified-session rollups the dashboard uses, so
 * "where my time went" and "how well it matched goals" are always consistent.
 */

import type {
  Goal,
  GoalAlignmentResult,
  GoalAlignmentStatus,
} from "@/types/goal";
import type { SessionWithClassification } from "./insights";
import { msToHours } from "@/lib/time";

/** Hours that counted toward the goal over the period. */
export function hoursForGoal(
  goal: Goal,
  sessions: SessionWithClassification[]
): number {
  let ms = 0;
  for (const s of sessions) {
    const c = s.classification;
    if (!c) continue;
    switch (goal.target_kind) {
      case "category":
        if (goal.target_value && c.category === goal.target_value) ms += s.duration_ms;
        break;
      case "project":
        if (goal.target_value && c.project === goal.target_value) ms += s.duration_ms;
        break;
      case "strategic":
        ms += s.duration_ms * c.strategic_score;
        break;
      case "reactive":
        ms += s.duration_ms * c.reactive_score;
        break;
    }
  }
  return msToHours(ms);
}

export function statusForGoal(
  goal: Goal,
  actualHours: number
): GoalAlignmentStatus {
  const target = goal.target_hours;
  if (target == null) return "unknown";
  if (goal.direction === "increase") {
    if (actualHours >= target) return "ahead";
    if (actualHours >= target * 0.8) return "on_track";
    return "behind";
  } else {
    // decrease
    if (actualHours <= target) return "on_track";
    if (actualHours <= target * 1.2) return "behind";
    return "behind";
  }
}

export function alignForGoal(
  goal: Goal,
  sessions: SessionWithClassification[]
): GoalAlignmentResult {
  const actual = Math.round(hoursForGoal(goal, sessions) * 100) / 100;
  const status = statusForGoal(goal, actual);
  return {
    goal,
    actual_hours: actual,
    status,
    note: noteFor(goal, actual, status),
  };
}

function noteFor(goal: Goal, actual: number, status: GoalAlignmentStatus): string {
  const target = goal.target_hours ?? 0;
  if (status === "unknown") return "No target hours set for this goal.";
  if (goal.direction === "increase") {
    if (status === "ahead")
      return `Exceeded target of ${target}h with ${actual}h.`;
    if (status === "on_track")
      return `${actual}h / ${target}h — nearly on pace.`;
    return `Only ${actual}h of the ${target}h target.`;
  }
  if (status === "on_track") return `Within target (${actual}h ≤ ${target}h).`;
  return `Over target: ${actual}h vs ${target}h cap.`;
}

export function alignAll(
  goals: Goal[],
  sessions: SessionWithClassification[]
): GoalAlignmentResult[] {
  return goals.filter((g) => g.active).map((g) => alignForGoal(g, sessions));
}
