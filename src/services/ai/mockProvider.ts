/**
 * MOCK: Deterministic rules-based AI provider.
 *
 * Exists so the full pipeline (classify -> insight -> summarize -> render) can
 * run end-to-end without an API key. Good enough to demo the product and to
 * keep tests hermetic.
 */

import type { NormalizedSession } from "@/types/activity";
import type {
  ClassificationFields,
  WorkCategory,
} from "@/types/classification";
import { msToHours } from "@/lib/time";
import {
  type AiProvider,
  type SummarizeArgs,
  KEYWORD_RULES,
} from "./provider";
import type { StructuredSummary, SummaryVariant } from "@/types/summary";

export class MockAiProvider implements AiProvider {
  readonly id = "mock-v1";

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    return sessions.map(classifyOne);
  }

  async summarize(args: SummarizeArgs) {
    return buildMockSummary(args);
  }
}

function classifyOne(s: NormalizedSession): ClassificationFields {
  const app = s.app_name.toLowerCase();
  const domain = (s.browser_domain ?? "").toLowerCase();
  const title = s.title_root.toLowerCase();

  let matched = KEYWORD_RULES.find((rule) => {
    if (rule.apps?.some((a) => app.includes(a.toLowerCase()))) return true;
    if (rule.domains?.some((d) => domain.endsWith(d))) return true;
    if (rule.titleContains?.some((t) => title.includes(t))) return true;
    return false;
  });

  let category: WorkCategory = matched?.category ?? "Unknown";
  let strategic = matched?.strategic ?? 0.3;
  let reactive = matched?.reactive ?? 0.3;
  let confidence = matched ? 0.6 : 0.25;

  // Project inference: first capitalized word in title that's not the app name.
  const project = inferProject(s.title_root, s.app_name);
  const task = inferTask(s.title_root);

  // Short sessions are rarely strategic.
  if (s.duration_ms < 5 * 60_000) {
    strategic = Math.max(0, strategic - 0.15);
    reactive = Math.min(1, reactive + 0.1);
  }
  // Long uninterrupted sessions skew strategic.
  if (s.duration_ms > 30 * 60_000 && s.interruption_count <= 1) {
    strategic = Math.min(1, strategic + 0.15);
    confidence = Math.min(1, confidence + 0.1);
  }

  return {
    project,
    task,
    category,
    strategic_score: round(strategic),
    reactive_score: round(reactive),
    confidence: round(confidence),
  };
}

function inferProject(title: string, app: string): string | null {
  const t = title.replace(new RegExp(app, "i"), "").trim();
  const m = t.match(/^([A-Za-z][\w-]{2,}(?:[ ][A-Za-z][\w-]+){0,3})/);
  return m ? m[1].trim() : null;
}

function inferTask(title: string): string | null {
  // Everything after the first separator is usually the "thing" being worked on.
  const m = title.match(/[—\-:]\s+(.+)$/);
  if (m) return m[1].trim();
  return title.length > 3 && title.length < 80 ? title : null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildMockSummary(args: SummarizeArgs): {
  text: string;
  structured: StructuredSummary;
} {
  const totalMs = args.sessions.reduce((a, s) => a + s.duration_ms, 0);
  const totalH = msToHours(totalMs);

  const byCategory = new Map<string, number>();
  const byApp = new Map<string, number>();
  const interruptionsBy = new Map<string, number>();
  let strategicMs = 0;
  let reactiveMs = 0;

  for (const s of args.sessions) {
    const c = s.classification;
    const cat = c?.category ?? "Unknown";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + s.duration_ms);
    byApp.set(s.app_name, (byApp.get(s.app_name) ?? 0) + s.duration_ms);
    if (c) {
      strategicMs += s.duration_ms * c.strategic_score;
      reactiveMs += s.duration_ms * c.reactive_score;
    }
    if (s.interruption_count > 0) {
      interruptionsBy.set(s.app_name, (interruptionsBy.get(s.app_name) ?? 0) + s.interruption_count);
    }
  }

  const timeWent = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, ms]) => ({ label, hours: round(msToHours(ms)) }));

  const topInterruptions = [...interruptionsBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([source, count]) => ({ source, count }));

  const highlights: string[] = [];
  const sortedSessions = [...args.sessions].sort((a, b) => b.duration_ms - a.duration_ms);
  for (const s of sortedSessions.slice(0, 3)) {
    const dur = round(msToHours(s.duration_ms));
    highlights.push(`${dur}h on ${s.title_root || s.app_name}`);
  }

  const structured: StructuredSummary = {
    period_kind: args.period_kind,
    headline: makeHeadline(args.variant, totalH, strategicMs, reactiveMs),
    highlights,
    time_went: timeWent,
    time_did_not_go: whatWasMissing(args),
    top_interruptions: topInterruptions,
    strategic_hours: round(msToHours(strategicMs)),
    reactive_hours: round(msToHours(reactiveMs)),
    accomplishment_candidates: pickAccomplishmentCandidates(args),
    goal_alignment: args.goals.map((g) => ({
      goal_label: g.label,
      status: "unknown" as const,
      note: "Alignment computed client-side; see Goals page for live status.",
    })),
  };

  const text = renderText(args.variant, structured);
  return { text, structured };
}

function makeHeadline(
  variant: SummaryVariant,
  totalH: number,
  strategicMs: number,
  reactiveMs: number
): string {
  const strat = round(msToHours(strategicMs));
  const react = round(msToHours(reactiveMs));
  const h = round(totalH);
  if (variant === "boss") {
    return `Active ${h}h; ${strat}h on strategic work, ${react}h absorbed by reactive work.`;
  }
  if (variant === "executive") {
    return `Net: ${strat}h strategic vs ${react}h reactive across ${h}h tracked.`;
  }
  if (variant === "self_review") {
    return `Worked ${h}h; delivered ${strat}h of strategic focus time.`;
  }
  return `${h}h of tracked activity — ${strat}h strategic, ${react}h reactive.`;
}

function whatWasMissing(args: SummarizeArgs): string[] {
  const out: string[] = [];
  const cats = new Set(args.sessions.map((s) => s.classification?.category));
  if (!cats.has("Strategic Planning")) out.push("No time booked on strategic planning.");
  if (!cats.has("Professional Growth")) out.push("No professional-growth time this period.");
  return out;
}

function pickAccomplishmentCandidates(args: SummarizeArgs) {
  const candidates = args.sessions
    .filter((s) => {
      const c = s.classification;
      if (!c) return false;
      if (c.category === "Breaks" || c.category === "Email/Admin") return false;
      return s.duration_ms >= 25 * 60_000 && c.strategic_score >= 0.5;
    })
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 4);

  return candidates.map((s) => ({
    title: s.classification?.project
      ? `${s.classification.project}: ${s.title_root || "focused block"}`
      : s.title_root || s.app_name,
    description: `Sustained ${round(msToHours(s.duration_ms))}h session with ${
      s.interruption_count
    } interruption(s).`,
  }));
}

function renderText(variant: SummaryVariant, s: StructuredSummary): string {
  const lines: string[] = [s.headline, ""];
  if (variant === "boss") {
    lines.push("What I shipped / moved forward:");
    for (const h of s.highlights) lines.push(`  • ${h}`);
    if (s.accomplishment_candidates.length) {
      lines.push("", "Worth flagging upward:");
      for (const a of s.accomplishment_candidates)
        lines.push(`  • ${a.title} — ${a.description}`);
    }
  } else if (variant === "executive") {
    lines.push("Outcomes:");
    for (const h of s.highlights) lines.push(`  • ${h}`);
    lines.push("", `Strategic vs reactive: ${s.strategic_hours}h / ${s.reactive_hours}h.`);
  } else if (variant === "self_review") {
    lines.push("Accomplishments:");
    for (const a of s.accomplishment_candidates)
      lines.push(`  • ${a.title}`);
  } else {
    lines.push("Where time went:");
    for (const t of s.time_went)
      lines.push(`  • ${t.label}: ${t.hours}h`);
    if (s.time_did_not_go.length) {
      lines.push("", "Gaps:");
      for (const g of s.time_did_not_go) lines.push(`  • ${g}`);
    }
    if (s.top_interruptions.length) {
      lines.push("", "Top interruption sources:");
      for (const t of s.top_interruptions)
        lines.push(`  • ${t.source} (${t.count})`);
    }
  }
  return lines.join("\n");
}

