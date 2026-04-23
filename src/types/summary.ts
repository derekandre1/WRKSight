import { z } from "zod";

export type PeriodKind = "day" | "week" | "month";

export type SummaryVariant =
  | "standard"
  | "boss"
  | "executive"
  | "self_review";

/**
 * Structured companion to the free-text summary. Keeping this typed lets the
 * UI render uniform widgets without re-parsing prose.
 */
export const StructuredSummarySchema = z.object({
  period_kind: z.enum(["day", "week", "month"]),
  headline: z.string(),
  highlights: z.array(z.string()),
  time_went: z.array(
    z.object({ label: z.string(), hours: z.number().min(0) })
  ),
  time_did_not_go: z.array(z.string()),
  top_interruptions: z.array(
    z.object({ source: z.string(), count: z.number().int().nonnegative() })
  ),
  strategic_hours: z.number().min(0),
  reactive_hours: z.number().min(0),
  accomplishment_candidates: z.array(
    z.object({ title: z.string(), description: z.string() })
  ),
  goal_alignment: z.array(
    z.object({
      goal_label: z.string(),
      status: z.enum(["ahead", "on_track", "behind", "unknown"]),
      note: z.string(),
    })
  ),
});

export type StructuredSummary = z.infer<typeof StructuredSummarySchema>;

export interface Summary {
  id: number | null;
  period_kind: PeriodKind;
  period_start: number;
  period_end: number;
  variant: SummaryVariant;
  text: string;
  structured_json: string;
  model: string;
  created_at: number;
}

export function parseStructuredSummary(s: Summary): StructuredSummary | null {
  try {
    const v = JSON.parse(s.structured_json);
    const out = StructuredSummarySchema.safeParse(v);
    return out.success ? out.data : null;
  } catch {
    return null;
  }
}
