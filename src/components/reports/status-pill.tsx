"use client";

import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Eye,
  Hourglass,
  TestTube2,
  type LucideIcon,
} from "lucide-react";
import { createElement, type ReactNode } from "react";

import { StatusBadge } from "@/components/common/status-badge";
import {
  STATUS_VARIANT,
  type ReportStatus,
} from "@/lib/stores/reports";

/**
 * Icon for each report status. Pairs with `STATUS_VARIANT` so every
 * status pill across the app reads as the same visual unit:
 *
 *   Sample Collected      🧪 sky
 *   Waiting for Results   ⏳ amber
 *   Review                👁  violet
 *   Published             ✓  emerald
 *   Cancelled             ⊘  neutral
 */
export const STATUS_ICON: Record<ReportStatus, LucideIcon> = {
  Ordered: ClipboardList,
  "Sample Collected": TestTube2,
  "Waiting for Results": Hourglass,
  Review: Eye,
  Published: CheckCircle2,
  Cancelled: Ban,
};

interface StatusPillProps {
  status: ReportStatus;
  size?: "sm" | "md";
  /** Render with just the icon, no label. Useful in dense table cells. */
  iconOnly?: boolean;
  className?: string;
  title?: string;
  children?: ReactNode;
}

export function StatusPill({
  status,
  size = "md",
  iconOnly = false,
  className,
  title,
  children,
}: StatusPillProps) {
  const icon = createElement(STATUS_ICON[status]);
  return (
    <StatusBadge
      variant={STATUS_VARIANT[status]}
      icon={icon}
      pill
      size={size}
      title={title ?? status}
      className={className}
    >
      {iconOnly ? null : (children ?? status)}
    </StatusBadge>
  );
}
