/**
 * Shared config for the admin time-range selector. Kept in a plain
 * module (no `"use client"`) so both the server page and the client
 * picker can import the constant directly. Importing values from a
 * `"use client"` module into a server component wraps them as client
 * references and breaks array methods like `.find()`.
 */

export const TIME_RANGE_PRESETS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "6m" },
  { days: 365, label: "1y" },
] as const;

/** Minimum/maximum allowed window in days. 1 day to 10 years. */
export const MIN_RANGE_DAYS = 1;
export const MAX_RANGE_DAYS = 365 * 10;

export const RANGE_UNITS = [
  { unit: "days" as const, label: "Days", multiplier: 1 },
  { unit: "weeks" as const, label: "Weeks", multiplier: 7 },
  { unit: "months" as const, label: "Months", multiplier: 30 },
  { unit: "years" as const, label: "Years", multiplier: 365 },
] as const;

export type RangeUnit = (typeof RANGE_UNITS)[number]["unit"];

/** Normalize a raw query-string value into a clamped positive day count. */
export function normalizeDays(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < MIN_RANGE_DAYS) return 30;
  if (n > MAX_RANGE_DAYS) return MAX_RANGE_DAYS;
  return Math.floor(n);
}

/**
 * Decompose a day-count into a friendlier (value, unit) pair. Prefers
 * days for short windows so 30 stays "30 days" instead of "1 month",
 * but switches to months once we reach 6+ months and to years once we
 * reach a whole-year multiple. Months are kept as 30-day buckets to
 * match how the windows are computed.
 */
function decompose(days: number): { value: number; unit: "day" | "month" | "year" } {
  if (days >= 365 && days % 365 === 0) {
    return { value: days / 365, unit: "year" };
  }
  if (days >= 180 && days % 30 === 0) {
    return { value: days / 30, unit: "month" };
  }
  return { value: days, unit: "day" };
}

/**
 * Short suffix used inside tile labels — "30d", "6m", "3y". Days for
 * short windows, months for ≥6m multiples of 30, years for whole-year
 * multiples.
 */
export function shortRangeLabel(days: number): string {
  const { value, unit } = decompose(days);
  if (unit === "year") return `${value}y`;
  if (unit === "month") return `${value}m`;
  return `${value}d`;
}

/**
 * Long human-readable label for the picker trigger button — "Last 30
 * days", "Last 6 months", "Last 3 years". Same decomposition as
 * shortRangeLabel so the two stay aligned.
 */
export function longRangeLabel(days: number): string {
  const { value, unit } = decompose(days);
  const word = unit + (value > 1 ? "s" : "");
  return `Last ${value} ${word}`;
}

/** Convert a (value, unit) pair to day count, clamped to allowed bounds. */
export function unitToDays(value: number, unit: RangeUnit): number {
  const mult = RANGE_UNITS.find((u) => u.unit === unit)?.multiplier ?? 1;
  const days = Math.floor(value * mult);
  if (!Number.isFinite(days) || days < MIN_RANGE_DAYS) return MIN_RANGE_DAYS;
  if (days > MAX_RANGE_DAYS) return MAX_RANGE_DAYS;
  return days;
}
