import { create } from "zustand";
import { ipc } from "@/lib/tauri";
import type {
  AiClassification,
  NormalizedSession,
  Summary,
  PeriodKind,
} from "@/types";
import type { Range } from "@/lib/time";
import {
  computeInsights,
  joinClassifications,
  type DashboardInsights,
  type SessionWithClassification,
} from "@/services/insights";
import { classifySessions } from "@/services/classifier";
import { getAiProvider } from "@/services/ai";
import type { SettingsMap } from "@/types";
import { generateSummary } from "@/services/summarizer";
import type { Goal } from "@/types/goal";

interface ActivityState {
  sessions: NormalizedSession[];
  classifications: AiClassification[];
  summaries: Summary[];
  insights: DashboardInsights | null;
  joined: SessionWithClassification[];
  loading: boolean;

  loadRange: (r: Range, settings: SettingsMap) => Promise<void>;
  loadSummaries: (period: PeriodKind, r: Range) => Promise<void>;
  ensureClassified: (settings: SettingsMap) => Promise<void>;
  buildSummary: (args: {
    range: Range;
    periodKind: PeriodKind;
    variant: Summary["variant"];
    goals: Goal[];
    settings: SettingsMap;
  }) => Promise<Summary>;
}

export const useActivity = create<ActivityState>((set, get) => ({
  sessions: [],
  classifications: [],
  summaries: [],
  insights: null,
  joined: [],
  loading: false,

  async loadRange(range, settings) {
    set({ loading: true });
    try {
      const [sessions, classifications] = await Promise.all([
        ipc.listSessions(range.start, range.end),
        ipc.listClassifications(range.start, range.end),
      ]);
      const joined = joinClassifications(sessions, classifications);
      set({
        sessions,
        classifications,
        joined,
        insights: computeInsights(joined),
      });
      // Don't auto-classify on every load — do it on demand when stale.
      void get().ensureClassified(settings);
    } finally {
      set({ loading: false });
    }
  },

  async loadSummaries(period, range) {
    const summaries = await ipc.listSummaries(period, range.start, range.end);
    set({ summaries });
  },

  async ensureClassified(settings) {
    const { sessions, classifications } = get();
    const classifiedIds = new Set(classifications.map((c) => c.session_id));
    const unclassified = sessions.filter((s) => s.id != null && !classifiedIds.has(s.id!));
    if (unclassified.length === 0) return;
    const provider = getAiProvider(settings);
    await classifySessions(unclassified, provider);
    // Refresh joined view.
    const all = [...classifications];
    // classifySessions persists; we pull the fresh rows next load. For now,
    // keep state consistent by merging mock results.
    for (const s of unclassified) {
      if (s.id == null) continue;
      all.push({
        id: null,
        session_id: s.id,
        project: null,
        task: null,
        category: "Unknown",
        strategic_score: 0.3,
        reactive_score: 0.3,
        confidence: 0.1,
        model: provider.id,
        created_at: Date.now(),
      });
    }
    const joined = joinClassifications(sessions, all);
    set({
      classifications: all,
      joined,
      insights: computeInsights(joined),
    });
  },

  async buildSummary(args) {
    const provider = getAiProvider(args.settings);
    const summary = await generateSummary({
      range: args.range,
      periodKind: args.periodKind,
      variant: args.variant,
      goals: args.goals,
      provider,
    });
    set({ summaries: [...get().summaries.filter((s) => !(s.period_kind === summary.period_kind && s.period_start === summary.period_start && s.variant === summary.variant)), summary] });
    return summary;
  },
}));
