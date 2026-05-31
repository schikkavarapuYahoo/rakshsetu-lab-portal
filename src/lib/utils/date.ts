const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Format a date-only ISO string ("YYYY-MM-DD") as "DD MMM YYYY".
 * Avoids the UTC-midnight pitfall of `new Date("YYYY-MM-DD")` which can render
 * as the previous day in negative-offset timezones.
 */
export function formatDateOnly(iso?: string): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${day} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
}

/**
 * Format an ISO datetime as "DD MMM YYYY, hh:mm am/pm" in en-IN locale.
 * Use this for audit stamps (created/updated timestamps).
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Compact absolute timestamp — drops the year when it matches the current
 * year. Suitable for dense list rows (dashboard attention queue, patients
 * "last visit" column). Returns "—" for empty/invalid input.
 *
 *   "18 May, 7:06 pm"       — current year
 *   "18 May 2025, 7:06 pm"  — different year
 */
export function formatCompactDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Date line for the stacked `<Timestamp>` component — "01 Apr 2026". */
export function formatDateLine(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Time line for the stacked `<Timestamp>` component — "4:00 pm". */
export function formatTimeLine(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
