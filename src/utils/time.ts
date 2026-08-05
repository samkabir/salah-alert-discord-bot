import { env } from "../config/env";

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: env.TIMEZONE });
}

export function currentWeekday(): "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: env.TIMEZONE, weekday: "short" })
    .format(new Date())
    .toLowerCase();
  const map: Record<string, "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };
  return map[parts.slice(0, 3)];
}

/**
 * Offset (in ms) of `timeZone` relative to UTC at the given instant.
 * Positive for zones ahead of UTC (e.g. +6h for Asia/Dhaka).
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/**
 * Build an absolute Date for a wall-clock time (`hours`:`minutes`) on `isoDate`
 * ("YYYY-MM-DD") interpreted in the configured TIMEZONE. Exact for zones without
 * DST (e.g. Asia/Dhaka); for DST zones it is accurate away from the transition.
 */
export function zonedTimeToDate(isoDate: string, hours: number, minutes: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guessUtcMs = Date.UTC(y, m - 1, d, hours, minutes, 0);
  const offset = tzOffsetMs(new Date(guessUtcMs), env.TIMEZONE);
  return new Date(guessUtcMs - offset);
}

/** Format an absolute Date as "HH:MM" wall-clock time in the configured TIMEZONE. */
export function formatTimeInZone(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: env.TIMEZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
