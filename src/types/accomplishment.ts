export type AccomplishmentSource = "ai_suggested" | "user";

export interface Accomplishment {
  id: number | null;
  title: string;
  description: string;
  evidence_json: string;
  occurred_on: number;
  source: AccomplishmentSource;
  created_at: number;
}

export interface AccomplishmentEvidence {
  session_ids: number[];
  period_kind?: "day" | "week" | "month";
  period_start?: number;
}

export function parseEvidence(a: Accomplishment): AccomplishmentEvidence {
  try {
    const v = JSON.parse(a.evidence_json);
    return {
      session_ids: Array.isArray(v.session_ids) ? v.session_ids : [],
      period_kind: v.period_kind,
      period_start: typeof v.period_start === "number" ? v.period_start : undefined,
    };
  } catch {
    return { session_ids: [] };
  }
}
