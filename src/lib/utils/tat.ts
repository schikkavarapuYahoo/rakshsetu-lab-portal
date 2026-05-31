import type { LabTest } from "@/lib/stores/lab-catalog";
import type { Report } from "@/lib/stores/reports";

/**
 * "Due now" reminder state for an in-flight report. The technician uses this
 * to know when results should be ready to enter.
 *
 * - `not-applicable` — report is already at Review / Published / Cancelled,
 *   or we don't know the test's TAT, or there's no usable reference timestamp.
 * - `on-track` — TAT hasn't elapsed yet; status is informational only.
 * - `due-soon` — within the last 25% of the TAT window (min 10 min).
 * - `overdue` — past the due time, technician should act.
 */
export type TatStatus =
  | "not-applicable"
  | "on-track"
  | "due-soon"
  | "overdue";

export interface TatState {
  status: TatStatus;
  /** Computed due time, or null when not applicable. */
  dueBy: Date | null;
  /** Signed minutes: positive = due in N min, negative = overdue by N min. */
  minutesUntilDue: number | null;
}

const ACTIVE_STATUSES = new Set<Report["status"]>([
  "Sample Collected",
  "Waiting for Results",
]);

/**
 * Pick the timestamp that anchors the TAT — the moment the technician
 * actually drew the sample. We scan the status history for the entry
 * where the report moved to "Sample Collected"; that's the only honest
 * starting point. Reports still at "Ordered" haven't started the clock
 * yet, so they shouldn't display a countdown at all.
 *
 * Falls back to history's first entry, then `createdAt` — both legacy
 * safety nets for older persisted reports that pre-date the Ordered
 * status (their `statusHistory[0]` will already be "Sample Collected").
 */
function getCollectedAtTimestamp(report: Report): number | null {
  const collected = report.statusHistory.find(
    (h) => h.status === "Sample Collected",
  );
  if (collected) {
    const t = Date.parse(collected.at);
    if (Number.isFinite(t)) return t;
  }
  const first = report.statusHistory[0];
  if (first) {
    const t = Date.parse(first.at);
    if (Number.isFinite(t)) return t;
  }
  const created = Date.parse(report.createdAt);
  return Number.isFinite(created) ? created : null;
}

export function getTatState(
  report: Report,
  labTest: LabTest | undefined,
  now: number = Date.now(),
): TatState {
  // Hydration guard: useTickingNow seeds with 0 to keep SSR and the first
  // client render in agreement. Treat that as "not yet known" so the chip
  // doesn't briefly show garbage values like "due in 494212h".
  if (now < 1_000_000_000_000) {
    return { status: "not-applicable", dueBy: null, minutesUntilDue: null };
  }
  if (!ACTIVE_STATUSES.has(report.status)) {
    return { status: "not-applicable", dueBy: null, minutesUntilDue: null };
  }
  // Per-report override wins over the catalog default — technicians use this
  // when a particular run is faster or slower than the lab-wide expectation
  // (e.g. analyzer queue backed up, urgent stat sample).
  const tatMinutes =
    typeof report.tatMinutes === "number" && report.tatMinutes > 0
      ? report.tatMinutes
      : labTest?.turnaroundMinutes;
  if (typeof tatMinutes !== "number") {
    return { status: "not-applicable", dueBy: null, minutesUntilDue: null };
  }
  const collectedAt = getCollectedAtTimestamp(report);
  if (collectedAt === null) {
    return { status: "not-applicable", dueBy: null, minutesUntilDue: null };
  }
  const dueByMs = collectedAt + tatMinutes * 60_000;
  const minutesUntilDue = Math.round((dueByMs - now) / 60_000);

  let status: TatStatus = "on-track";
  if (minutesUntilDue < 0) {
    status = "overdue";
  } else {
    // "Due soon" = the last 25% of the TAT window, with a 10-minute floor
    // so very short TATs (e.g. urine routine, 30 min) still get a warning.
    const soonWindow = Math.max(10, Math.floor(tatMinutes / 4));
    if (minutesUntilDue <= soonWindow) status = "due-soon";
  }

  return { status, dueBy: new Date(dueByMs), minutesUntilDue };
}

/** Human-readable countdown — "due in 18m", "overdue 2h 5m", etc. */
export function formatTatRemaining(state: TatState): string {
  if (state.minutesUntilDue === null) return "";
  const total = Math.abs(state.minutesUntilDue);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const compact =
    hours > 0
      ? minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`
      : `${minutes}m`;
  if (state.status === "overdue") return `overdue ${compact}`;
  if (state.status === "due-soon") return `due in ${compact}`;
  return `due in ${compact}`;
}
