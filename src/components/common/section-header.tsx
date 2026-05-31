"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  /** Small text rendered after the title — typically a count or hint. */
  meta?: ReactNode;
  /** Right-aligned slot for actions or links. */
  actions?: ReactNode;
  /** Use the small uppercase variant (for low-emphasis section dividers). */
  uppercase?: boolean;
  className?: string;
}

/**
 * Consistent section heading. Defaults to a sentence-case sub-heading; pass
 * `uppercase` for the small tracking-wide variant used for dashboard section
 * dividers ("Pipeline", "Last 7 days", etc).
 */
export function SectionHeader({
  title,
  meta,
  actions,
  uppercase = false,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="flex items-baseline gap-2">
        {uppercase ? (
          <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {title}
          </h2>
        ) : (
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>
        )}
        {meta && (
          <span className="text-muted-foreground text-xs">{meta}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
