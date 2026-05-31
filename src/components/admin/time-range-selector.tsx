"use client";

import { Popover } from "@base-ui/react/popover";
import { Calendar, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  MAX_RANGE_DAYS,
  RANGE_UNITS,
  TIME_RANGE_PRESETS,
  type RangeUnit,
  longRangeLabel,
  unitToDays,
} from "@/components/admin/time-range-config";
import { cn } from "@/lib/utils";

interface TimeRangeSelectorProps {
  /** Currently-selected window in days. Read from the URL by the parent. */
  selected: number;
  /** Query-param name to write under. Defaults to "range". */
  paramName?: string;
}

/**
 * Kibana-style time-range picker. Trigger shows the current window as
 * "Last 30 days"; popover contains quick preset chips plus a free-form
 * "Last [N] [unit]" input for anything outside the preset list.
 *
 * URL-backed state — writes `?range=N` (days) and lets the surrounding
 * server page re-query Firestore on the new window. Deep links and
 * refreshes preserve the selection.
 */
export function TimeRangeSelector({
  selected,
  paramName = "range",
}: TimeRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Seed the custom inputs from the currently-selected window so the
  // user can fine-tune without retyping. Pick the largest unit that
  // divides cleanly so a 30-day window opens as "1 month" rather than
  // "30 days" — matches what `longRangeLabel` shows.
  const initial = pickInitialUnit(selected);
  const [customValue, setCustomValue] = useState<string>(String(initial.value));
  const [customUnit, setCustomUnit] = useState<RangeUnit>(initial.unit);

  function applyDays(days: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(paramName, String(days));
    setOpen(false);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function applyCustom() {
    const n = Number(customValue);
    if (!Number.isFinite(n) || n < 1) return;
    const days = unitToDays(n, customUnit);
    applyDays(days);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted",
              pending && "opacity-60",
            )}
          >
            <Calendar className="h-4 w-4 text-neutral-500" />
            <span>{longRangeLabel(selected)}</span>
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup
            className={cn(
              "z-50 w-80 rounded-xl bg-card p-4 text-card-foreground shadow-lg",
              "ring-1 ring-foreground/10",
              "outline-none",
            )}
          >
            <div className="space-y-4">
              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Quick select
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_RANGE_PRESETS.map((p) => {
                    const active = p.days === selected;
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => applyDays(p.days)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-brand-500 text-white"
                            : "border border-border bg-background text-neutral-700 hover:bg-muted",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Custom range
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyCustom();
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-sm text-neutral-600">Last</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_RANGE_DAYS}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="Amount"
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as RangeUnit)}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="Unit"
                  >
                    {RANGE_UNITS.map((u) => (
                      <option key={u.unit} value={u.unit}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md bg-brand-500 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                  >
                    Apply
                  </button>
                </form>
                <p className="mt-2 text-[11px] text-neutral-400">
                  Up to 10 years.
                </p>
              </section>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function pickInitialUnit(days: number): { value: number; unit: RangeUnit } {
  if (days >= 365 && days % 365 === 0) return { value: days / 365, unit: "years" };
  if (days >= 30 && days % 30 === 0) return { value: days / 30, unit: "months" };
  if (days >= 7 && days % 7 === 0) return { value: days / 7, unit: "weeks" };
  return { value: days, unit: "days" };
}
