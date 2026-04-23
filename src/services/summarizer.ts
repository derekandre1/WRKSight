/**
 * Summary orchestration. Joins sessions+classifications, calls the provider,
 * validates structured output, persists.
 */

import type {
  PeriodKind,
  Summary,
  SummaryVariant,
} from "@/types/summary";
import { StructuredSummarySchema } from "@/types/summary";
import type { Goal } from "@/types/goal";
import type { AiProvider } from "./ai/provider";
import { ipc } from "@/lib/tauri";
import type { Range } from "@/lib/time";
import { joinClassifications } from "./insights";

export interface GenerateSummaryArgs {
  range: Range;
  periodKind: PeriodKind;
  variant: SummaryVariant;
  goals: Goal[];
  provider: AiProvider;
}

export async function generateSummary(args: GenerateSummaryArgs): Promise<Summary> {
  const [sessions, classifications] = await Promise.all([
    ipc.listSessions(args.range.start, args.range.end),
    ipc.listClassifications(args.range.start, args.range.end),
  ]);
  const joined = joinClassifications(sessions, classifications);

  const { text, structured } = await args.provider.summarize({
    period_kind: args.periodKind,
    variant: args.variant,
    period_start: args.range.start,
    period_end: args.range.end,
    sessions: joined,
    goals: args.goals.map((g) => ({
      label: g.label,
      target_kind: g.target_kind,
      target_hours: g.target_hours,
      direction: g.direction,
      target_value: g.target_value,
    })),
  });

  const parsed = StructuredSummarySchema.safeParse(structured);
  const structured_json = parsed.success
    ? JSON.stringify(parsed.data)
    : JSON.stringify({
        period_kind: args.periodKind,
        headline: "Summary unavailable (invalid structured output).",
        highlights: [],
        time_went: [],
        time_did_not_go: [],
        top_interruptions: [],
        strategic_hours: 0,
        reactive_hours: 0,
        accomplishment_candidates: [],
        goal_alignment: [],
      });

  const row: Summary = {
    id: null,
    period_kind: args.periodKind,
    period_start: args.range.start,
    period_end: args.range.end,
    variant: args.variant,
    text,
    structured_json,
    model: args.provider.id,
    created_at: Date.now(),
  };
  await ipc.upsertSummary(row);
  return row;
}
