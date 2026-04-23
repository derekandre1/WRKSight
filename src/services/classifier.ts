/**
 * Classification orchestration. Takes sessions, calls an `AiProvider`,
 * validates the output, persists results via IPC.
 *
 * Validation is not optional — if the provider returns junk, we fall back to
 * a safe "Unknown / low confidence" classification rather than polluting the
 * DB.
 */

import { z } from "zod";
import type { NormalizedSession } from "@/types/activity";
import {
  ClassificationSchema,
  type AiClassification,
  type ClassificationFields,
} from "@/types/classification";
import type { AiProvider } from "./ai/provider";
import { ipc } from "@/lib/tauri";

export interface ClassifyResult {
  session_id: number;
  classification: ClassificationFields;
  valid: boolean;
}

const BatchSchema = z.array(ClassificationSchema);

export async function classifySessions(
  sessions: NormalizedSession[],
  provider: AiProvider
): Promise<ClassifyResult[]> {
  const toClassify = sessions.filter((s) => s.id != null);
  if (toClassify.length === 0) return [];

  const raw = await provider.classifyBatch(toClassify);
  const parsed = BatchSchema.safeParse(raw);

  const results: ClassifyResult[] = [];
  if (!parsed.success || parsed.data.length !== toClassify.length) {
    // Validation failed wholesale — one-by-one fallback so the bad apple doesn't
    // spoil the batch.
    for (const s of toClassify) {
      const one = raw[toClassify.indexOf(s)] as unknown;
      const r = ClassificationSchema.safeParse(one);
      if (r.success) {
        results.push({ session_id: s.id!, classification: r.data, valid: true });
      } else {
        results.push({ session_id: s.id!, classification: safeFallback(), valid: false });
      }
    }
  } else {
    parsed.data.forEach((c, i) => {
      results.push({ session_id: toClassify[i].id!, classification: c, valid: true });
    });
  }

  // Persist.
  const now = Date.now();
  for (const r of results) {
    const row: AiClassification = {
      id: null,
      session_id: r.session_id,
      project: r.classification.project,
      task: r.classification.task,
      category: r.classification.category,
      strategic_score: r.classification.strategic_score,
      reactive_score: r.classification.reactive_score,
      confidence: r.classification.confidence,
      model: provider.id,
      created_at: now,
    };
    await ipc.upsertClassification(row);
  }

  return results;
}

export function safeFallback(): ClassificationFields {
  return {
    project: null,
    task: null,
    category: "Unknown",
    strategic_score: 0.3,
    reactive_score: 0.3,
    confidence: 0.1,
  };
}
