import { z } from "zod";

export const WORK_CATEGORIES = [
  "Strategic Planning",
  "Execution",
  "Email/Admin",
  "Meetings",
  "Professional Growth",
  "Reactive/Fire Drills",
  "Breaks",
  "Unknown",
] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

/**
 * Schema used to validate classifier output before we trust it.
 * Rejecting malformed AI output here is what keeps the rest of the pipeline
 * honest. See `services/classifier.ts`.
 */
export const ClassificationSchema = z.object({
  project: z.string().nullable(),
  task: z.string().nullable(),
  category: z.enum(WORK_CATEGORIES),
  strategic_score: z.number().min(0).max(1),
  reactive_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export type ClassificationFields = z.infer<typeof ClassificationSchema>;

export interface AiClassification extends ClassificationFields {
  id: number | null;
  session_id: number;
  model: string;
  created_at: number;
}
