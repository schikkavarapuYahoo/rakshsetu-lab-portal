"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Icon shown above the title — typically a lucide icon. */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Action slot — buttons or links rendered below the description. */
  action?: ReactNode;
  /** Visual variant; `inline` is a tight version for table rows. */
  variant?: "block" | "inline";
  className?: string;
}

/**
 * Friendly empty-state placeholder. Used when a table or list has no rows
 * either because nothing matches the filters or because the resource is
 * genuinely empty. Pairs a soft icon with a short headline + helpful
 * follow-up text + an optional action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "block",
  className,
}: EmptyStateProps) {
  const isInline = variant === "inline";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isInline ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500",
            isInline ? "h-9 w-9" : "h-12 w-12",
          )}
        >
          <Icon className={cn(isInline ? "h-4 w-4" : "h-5 w-5")} />
        </div>
      )}
      <div className={cn("max-w-sm", Icon ? "mt-3" : "")}>
        <div
          className={cn(
            "font-medium text-neutral-900",
            isInline ? "text-sm" : "text-base",
          )}
        >
          {title}
        </div>
        {description && (
          <p
            className={cn(
              "text-muted-foreground mt-1",
              isInline ? "text-xs" : "text-sm",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
