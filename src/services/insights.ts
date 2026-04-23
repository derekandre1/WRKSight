/**
 * Derived analytics over classified sessions.
 * Pure functions. No IPC.
 */

import type { NormalizedSession } from "@/types/activity";
import type {
  AiClassification,
  ClassificationFields,
} from "@/types/classification";
import { msToHours } from "@/lib/time";

export interface SessionWithClassification extends NormalizedSession {
  classification?: ClassificationFields | null;
}

export interface DashboardInsights {
  total_hours: number;
  active_hours: number;
  strategic_hours: number;
  reactive_hours: number;
  focus_ratio: number;            // 0..1, share of time in 20m+ sessions
  fragmentation_index: number;    // higher = more context switches/hr
  interruption_count: number;
  uncategorized_hours: number;
  by_app: Array<{ label: string; hours: number }>;
  by_category: Array<{ label: string; hours: number }>;
  by_project: Array<{ label: string; hours: number }>;
  top_interruptions: Array<{ source: string; count: number }>;
}

export function joinClassifications(
  sessions: NormalizedSession[],
  classifications: AiClassification[]
): SessionWithClassification[] {
  const byId = new Map<number, AiClassification>();
  for (const c of classifications) byId.set(c.session_id, c);
  return sessions.map((s) => ({
    ...s,
    classification: s.id != null ? byId.get(s.id) ?? null : null,
  }));
}

export function computeInsights(
  sessions: SessionWithClassification[]
): DashboardInsights {
  const totalMs = sessions.reduce((a, s) => a + s.duration_ms, 0);
  const activeMs = sessions.reduce((a, s) => a + s.duration_ms, 0);
  let strategicMs = 0;
  let reactiveMs = 0;
  let uncategorizedMs = 0;
  const byApp = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byProject = new Map<string, number>();
  const interruptionsBy = new Map<string, number>();
  let totalInterruptions = 0;

  let focusMs = 0;
  const focusThresholdMs = 20 * 60_000;
  let contextSwitches = 0;

  for (const s of sessions) {
    byApp.set(s.app_name, (byApp.get(s.app_name) ?? 0) + s.duration_ms);
    const cat = s.classification?.category ?? "Unknown";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + s.duration_ms);
    const proj = s.classification?.project;
    if (proj) byProject.set(proj, (byProject.get(proj) ?? 0) + s.duration_ms);

    if (s.classification) {
      strategicMs += s.duration_ms * s.classification.strategic_score;
      reactiveMs += s.duration_ms * s.classification.reactive_score;
    } else {
      uncategorizedMs += s.duration_ms;
    }

    if (s.interruption_count > 0) {
      interruptionsBy.set(s.app_name, (interruptionsBy.get(s.app_name) ?? 0) + s.interruption_count);
      totalInterruptions += s.interruption_count;
    }

    if (s.duration_ms >= focusThresholdMs) focusMs += s.duration_ms;
    contextSwitches += s.context_switch_count;
  }

  const totalHours = msToHours(totalMs);
  const fragmentation =
    totalHours > 0 ? (contextSwitches + totalInterruptions) / totalHours : 0;

  return {
    total_hours: round(totalHours),
    active_hours: round(msToHours(activeMs)),
    strategic_hours: round(msToHours(strategicMs)),
    reactive_hours: round(msToHours(reactiveMs)),
    focus_ratio: totalMs ? round(focusMs / totalMs) : 0,
    fragmentation_index: round(fragmentation),
    interruption_count: totalInterruptions,
    uncategorized_hours: round(msToHours(uncategorizedMs)),
    by_app: toSortedRows(byApp),
    by_category: toSortedRows(byCategory),
    by_project: toSortedRows(byProject),
    top_interruptions: [...interruptionsBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count })),
  };
}

/**
 * Suggest accomplishments worth saving. Heuristic:
 *   strategic_score >= 0.5 AND duration >= 25m AND interruptions <= 2
 */
export function accomplishmentCandidates(
  sessions: SessionWithClassification[]
): SessionWithClassification[] {
  return sessions
    .filter((s) => {
      const c = s.classification;
      if (!c) return false;
      return (
        c.strategic_score >= 0.5 &&
        s.duration_ms >= 25 * 60_000 &&
        s.interruption_count <= 2 &&
        c.category !== "Breaks"
      );
    })
    .sort((a, b) => b.duration_ms - a.duration_ms);
}

function toSortedRows(m: Map<string, number>): Array<{ label: string; hours: number }> {
  return [...m.entries()]
    .map(([label, ms]) => ({ label, hours: round(msToHours(ms)) }))
    .sort((a, b) => b.hours - a.hours);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
