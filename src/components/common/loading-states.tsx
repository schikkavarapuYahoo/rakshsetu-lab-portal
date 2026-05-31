"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder for a page-level loading state: title bar + a few
 * content blocks. Used while a Zustand store hasn't hydrated yet, so the
 * first paint isn't a bare "Loading..." string.
 */
export function PageSkeleton({
  maxWidth = "max-w-400",
}: {
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto space-y-6", maxWidth)}>
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-neutral-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for the dashboard layout — banner, pipeline grid,
 * stat row, attention queue, and right rail.
 */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-400 space-y-6">
      <Skeleton className="h-12 w-full" />
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <aside className="space-y-4">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </aside>
      </div>
    </div>
  );
}
