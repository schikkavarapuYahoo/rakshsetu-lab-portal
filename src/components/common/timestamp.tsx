"use client";

import { cn } from "@/lib/utils";
import { formatDateLine, formatTimeLine } from "@/lib/utils/date";

interface TimestampProps {
  /** ISO datetime string. May be undefined; the `fallback` renders instead. */
  at: string | undefined | null;
  /** Shown when `at` is missing or unparseable. Defaults to an em-dash. */
  fallback?: string;
  /** Optional tooltip text — typically the relative time ("2h ago"). */
  title?: string;
  className?: string;
}

/**
 * Two-line absolute timestamp display:
 *
 *   01 Apr 2026
 *   4:00 pm
 *
 * Renders the date as the primary line and the time below it in a muted
 * tone. Used wherever we want unambiguous time information that's still
 * scannable at a glance (patients list, patient profile, dashboard
 * attention queue).
 */
export function Timestamp({
  at,
  fallback = "—",
  title,
  className,
}: TimestampProps) {
  const date = formatDateLine(at);
  const time = formatTimeLine(at);
  if (!date || !time) {
    return (
      <span
        className={cn("text-muted-foreground text-sm", className)}
        title={title}
      >
        {fallback}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex flex-col leading-tight", className)}
      title={title}
    >
      <span className="text-sm font-medium text-neutral-900 tabular-nums">
        {date}
      </span>
      <span className="text-muted-foreground mt-0.5 text-xs tabular-nums">
        {time}
      </span>
    </span>
  );
}
