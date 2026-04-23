import { format } from "date-fns";

export function fmtDate(ms: number): string {
  return format(new Date(ms), "MMM d");
}

export function fmtDateTime(ms: number): string {
  return format(new Date(ms), "MMM d, h:mma");
}

export function fmtTime(ms: number): string {
  return format(new Date(ms), "h:mma");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function percent(n: number): string {
  return `${Math.round(clamp(n, 0, 1) * 100)}%`;
}
