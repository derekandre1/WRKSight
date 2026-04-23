/**
 * Client-side exclusions helpers.
 *
 * Note: authoritative exclusion happens in Rust before any row is written.
 * This module exists to (a) let the UI preview what would be excluded and
 * (b) surface human-friendly messages.
 */

import type { Exclusion, RawActivityEvent } from "@/types";

export interface ExcludeDecision {
  excluded: boolean;
  reason?: string;
}

export function decide(
  event: Pick<RawActivityEvent, "app_name" | "window_title" | "browser_domain">,
  exclusions: Exclusion[]
): ExcludeDecision {
  const app = event.app_name.toLowerCase();
  const title = event.window_title.toLowerCase();
  const domain = (event.browser_domain ?? "").toLowerCase();

  for (const e of exclusions) {
    const v = e.value.toLowerCase();
    if (e.kind === "app" && (app === v || app.includes(v))) {
      return { excluded: true, reason: `app excluded (${e.value})` };
    }
    if (e.kind === "domain" && domain) {
      if (domain === v || domain.endsWith(`.${v}`)) {
        return { excluded: true, reason: `domain excluded (${e.value})` };
      }
    }
    if (e.kind === "title_glob" && title.includes(v)) {
      return { excluded: true, reason: `title pattern excluded (${e.value})` };
    }
  }
  return { excluded: false };
}

export function validateExclusion(kind: string, value: string): string | null {
  if (!value.trim()) return "Value cannot be empty.";
  if (value.length > 120) return "Too long.";
  if (!["app", "domain", "title_glob"].includes(kind)) return "Unknown kind.";
  if (kind === "domain") {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())) {
      return "Domain looks malformed (expected something like example.com).";
    }
  }
  return null;
}
