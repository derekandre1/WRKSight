import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export interface Range {
  start: number;
  end: number;
}

export function dayRange(d: Date = new Date()): Range {
  return { start: startOfDay(d).getTime(), end: endOfDay(d).getTime() };
}

export function weekRange(d: Date = new Date()): Range {
  return {
    start: startOfWeek(d, { weekStartsOn: 1 }).getTime(),
    end: endOfWeek(d, { weekStartsOn: 1 }).getTime(),
  };
}

export function monthRange(d: Date = new Date()): Range {
  return { start: startOfMonth(d).getTime(), end: endOfMonth(d).getTime() };
}

export function msToHours(ms: number): number {
  return ms / 3_600_000;
}

export function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
