"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface BackLink {
  href: string;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional back-link rendered above the title. */
  back?: BackLink;
  /** Right-aligned actions (typically a primary button). */
  actions?: ReactNode;
  /** Extra badges / pills rendered next to the title. */
  badges?: ReactNode;
  className?: string;
}

/**
 * Consistent page chrome: optional back link, title, description, badges
 * inline with the title, primary action(s) on the right.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  badges,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {back && (
        <Link
          href={back.href}
          onClick={back.onClick}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
