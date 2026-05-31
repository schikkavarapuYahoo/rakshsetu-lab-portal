"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Unified status / tag / indicator badge. Replaces the ad-hoc chip styling
 * scattered across the app so colour has a single, consistent meaning:
 *
 *   neutral  — informational, low-emphasis (codes, counts, labels)
 *   info     — in-progress / sample handling (sky)
 *   success  — completed / paid / enabled (emerald)
 *   warning  — needs attention soon / unpaid / waiting (amber)
 *   danger   — overdue / critical / blocking (red)
 *   accent   — special / custom / grouping (violet)
 *
 * The `dot` and `icon` props are mutually exclusive in practice — a small
 * coloured dot for status pills, an icon for action-oriented badges.
 */
export type StatusBadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "brand";

const VARIANT_CLASSES: Record<
  StatusBadgeVariant,
  { container: string; dot: string }
> = {
  neutral: {
    container: "bg-neutral-100 text-neutral-600 ring-neutral-200",
    dot: "bg-neutral-400",
  },
  brand: {
    container: "bg-brand-50 text-brand-700 ring-brand-200",
    dot: "bg-brand-500",
  },
  info: {
    container: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
  },
  success: {
    container: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  warning: {
    container: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
  },
  danger: {
    container: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500",
  },
  accent: {
    container: "bg-violet-50 text-violet-700 ring-violet-200",
    dot: "bg-violet-500",
  },
};

interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
  /** Show a small filled circle in the variant colour. */
  dot?: boolean;
  /** Render as a pill (rounded-full) instead of the default rounded-md. */
  pill?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}

export function StatusBadge({
  variant = "neutral",
  size = "md",
  icon,
  dot = false,
  pill = false,
  title,
  className,
  children,
}: StatusBadgeProps) {
  const v = VARIANT_CLASSES[variant];
  const sizeClasses =
    size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-[11px]";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 font-medium ring-1 ring-inset",
        pill ? "rounded-full" : "rounded-md",
        sizeClasses,
        v.container,
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "rounded-full",
            v.dot,
            size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5",
          )}
        />
      )}
      {icon && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full",
            iconSize,
          )}
        >
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
