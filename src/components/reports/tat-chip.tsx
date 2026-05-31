"use client";

import { AlarmClock, Clock, TimerReset, type LucideIcon } from "lucide-react";

import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import { formatTatRemaining, type TatState } from "@/lib/utils/tat";

interface TatChipProps {
  state: TatState;
  /** Tight variant — smaller padding for use inside list rows. */
  compact?: boolean;
  /**
   * Stack the label and the remaining-time on two lines, e.g.
   *   ⏰ overdue
   *      25h 6m
   * Useful in tight horizontal rows where a single-line chip would push
   * other columns around.
   */
  stacked?: boolean;
  className?: string;
}

/**
 * Shows the technician how soon a report's results are expected. Hidden for
 * reports that have already moved past data-entry (Review / Published) and
 * for reports where the lab catalog hasn't defined a TAT yet.
 *
 * Rendered via `StatusBadge` so the colour palette (danger / warning /
 * success) stays in sync with every other badge in the app.
 */
export function TatChip({
  state,
  compact = false,
  stacked = false,
  className,
}: TatChipProps) {
  if (state.status === "not-applicable") return null;

  const text = formatTatRemaining(state);
  const config: {
    variant: StatusBadgeVariant;
    Icon: LucideIcon;
    title: string;
  } =
    state.status === "overdue"
      ? {
          variant: "danger",
          Icon: AlarmClock,
          title:
            "Results were expected by now — enter them or check the analyzer",
        }
      : state.status === "due-soon"
        ? {
            variant: "warning",
            Icon: TimerReset,
            title: "Results due soon — get ready to enter them",
          }
        : {
            variant: "success",
            Icon: Clock,
            title: "Results not yet due",
          };

  // Stacked variant — small bespoke pill with icon + two text lines.
  // Splits "overdue 25h 6m" → "overdue" / "25h 6m".
  if (stacked) {
    const match = text.match(/^(overdue|due in)\s+(.*)$/);
    const label = match?.[1] ?? text;
    const remaining = match?.[2] ?? "";
    const tone =
      config.variant === "danger"
        ? "bg-red-50 text-red-700 ring-red-200"
        : config.variant === "warning"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200";
    return (
      <span
        title={config.title}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ring-1 ring-inset",
          tone,
          className,
        )}
      >
        <config.Icon className="h-5 w-5 shrink-0" />
        <span className="flex flex-col text-[10px] leading-tight">
          <span>{label}</span>
          {remaining && <span className="tabular-nums">{remaining}</span>}
        </span>
      </span>
    );
  }

  return (
    <StatusBadge
      variant={config.variant}
      icon={<config.Icon />}
      size={compact ? "sm" : "md"}
      pill
      title={config.title}
      className={className}
    >
      {text}
    </StatusBadge>
  );
}
