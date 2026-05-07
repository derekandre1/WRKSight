/**
 * The single seam between WRKSight and any AI backend.
 *
 * Implementations should:
 *   1. Accept ONLY already-normalized session metadata (no raw events).
 *   2. Return structured, schema-validated output.
 *   3. Be stateless — the app decides when to call.
 *
 * Every implementation is swapped via the `ai_active_provider` setting.
 */

import type { NormalizedSession } from "@/types/activity";
import type {
  ClassificationFields,
  WorkCategory,
} from "@/types/classification";
import type {
  StructuredSummary,
  PeriodKind,
  SummaryVariant,
} from "@/types/summary";

export interface AiProvider {
  readonly id: string;

  classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]>;

  summarize(args: SummarizeArgs): Promise<{
    text: string;
    structured: StructuredSummary;
  }>;
}

export interface SummarizeArgs {
  period_kind: PeriodKind;
  variant: SummaryVariant;
  period_start: number;
  period_end: number;
  sessions: Array<
    NormalizedSession & { classification?: ClassificationFields | null }
  >;
  goals: Array<{ label: string; target_kind: string; target_hours?: number | null; direction: string; target_value?: string | null }>;
}

export interface CategoryKeyword {
  category: WorkCategory;
  apps?: string[];
  domains?: string[];
  titleContains?: string[];
  strategic?: number;
  reactive?: number;
}

/**
 * Shared keyword rules used by the mock provider *and* as a pre-pass for real
 * providers (so they get a hint for low-confidence cases). Editable in code.
 */
export const KEYWORD_RULES: CategoryKeyword[] = [
  {
    category: "Meetings",
    apps: ["Zoom", "Microsoft Teams", "Google Meet", "Webex", "Meet"],
    strategic: 0.4,
    reactive: 0.3,
  },
  {
    category: "Email/Admin",
    apps: ["Mail", "Outlook", "Thunderbird"],
    titleContains: ["inbox"],
    strategic: 0.1,
    reactive: 0.6,
  },
  {
    category: "Execution",
    apps: [
      "VSCode",
      "IntelliJ",
      "PyCharm",
      "WebStorm",
      "Xcode",
      "Android Studio",
      "Sublime Text",
      "Vim",
      "Emacs",
      "Terminal",
      "iTerm2",
      "Warp",
    ],
    strategic: 0.6,
    reactive: 0.2,
  },
  {
    category: "Strategic Planning",
    apps: ["Notion", "Confluence", "Obsidian", "Roam", "Logseq"],
    titleContains: ["okr", "roadmap", "strategy", "plan", "proposal"],
    strategic: 0.9,
    reactive: 0.05,
  },
  {
    category: "Reactive/Fire Drills",
    apps: ["Slack", "Discord", "Microsoft Teams"],
    titleContains: ["incident", "oncall", "on-call", "pager", "fire"],
    strategic: 0.1,
    reactive: 0.8,
  },
  {
    category: "Professional Growth",
    domains: [
      "coursera.org",
      "udemy.com",
      "pluralsight.com",
      "oreilly.com",
      "youtube.com",
    ],
    titleContains: ["course", "tutorial", "learning"],
    strategic: 0.7,
    reactive: 0.1,
  },
  {
    category: "Breaks",
    domains: ["news.ycombinator.com", "reddit.com", "twitter.com", "x.com"],
    strategic: 0.05,
    reactive: 0.2,
  },
];
