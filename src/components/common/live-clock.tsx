"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type LiveClockVariant = "inline" | "pill";

interface LiveClockProps {
  /**
   * How often to refresh, in milliseconds. Defaults to once per minute —
   * matches the precision we display (h:mm) and avoids unnecessary re-renders.
   */
  intervalMs?: number;
  /**
   * `inline` — bare time text (for embedding next to another label).
   * `pill`   — small rounded chip with a clock icon and time, suitable
   *            for use as a distinct visual element.
   */
  variant?: LiveClockVariant;
  /** Show the small clock icon. Defaults on for `pill`, off for `inline`. */
  showIcon?: boolean;
  className?: string;
}

/**
 * Self-updating wall-clock time, formatted as "7:42 pm". Renders an empty
 * placeholder on the server (Next.js SSR) to avoid a hydration mismatch —
 * the client picks up the real time on first paint and then ticks on the
 * interval.
 */
export function LiveClock({
  intervalMs = 60_000,
  variant = "inline",
  showIcon,
  className,
}: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const renderIcon = showIcon ?? variant === "pill";

  if (!now) {
    // Reserve visual space so the layout doesn't shift on hydration. Width
    // is approximate but matches the typical "7:42 pm" footprint.
    return (
      <span
        aria-hidden
        className={cn(
          "inline-block",
          variant === "pill"
            ? "h-7 w-24 rounded-full bg-neutral-100"
            : "w-14",
          className,
        )}
      />
    );
  }

  const time = now.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (variant === "pill") {
    return (
      <time
        dateTime={now.toISOString()}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-xs font-medium text-neutral-700 ring-1 ring-neutral-200 ring-inset",
          className,
        )}
      >
        <Clock className="h-3 w-3 text-neutral-500" />
        <span className="tabular-nums">{time}</span>
      </time>
    );
  }

  return (
    <time
      className={cn(
        "inline-flex items-center gap-1.5 tabular-nums",
        className,
      )}
      dateTime={now.toISOString()}
    >
      {renderIcon && (
        <Clock className="h-3.5 w-3.5 text-neutral-400" />
      )}
      {time}
    </time>
  );
}
