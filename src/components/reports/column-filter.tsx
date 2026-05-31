"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

interface ColumnFilterProps {
  /** Accessible label used by screen readers when the trigger is icon-only. */
  ariaLabel: string;
  /** True when at least one filter from this column is set. */
  isActive: boolean;
  /** Popover body — the column-specific filter form. */
  children: ReactNode;
  /** Optional cleanup callback for a "Clear" button inside the popover. */
  onClear?: () => void;
  /** Side of the trigger to align the popover to. Default `start`. */
  align?: "start" | "end";
}

/**
 * Icon-only filter trigger that lives next to a column header. The header
 * label itself is a separate sort button (see `ColumnHeader`). When the
 * column has an active filter the icon stays visible and brand-tinted so
 * the user can see at a glance which columns are constraining the table.
 */
export function ColumnFilter({
  ariaLabel,
  isActive,
  children,
  onClear,
  align = "start",
}: ColumnFilterProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
          isActive
            ? "text-brand-700 bg-brand-50"
            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700",
        )}
      >
        <Filter className="h-3 w-3" />
        {isActive && (
          <span
            aria-hidden
            className="bg-brand-500 absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
          />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align={align}>
          <Popover.Popup className="z-50 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg outline-none">
            <div className="space-y-2">{children}</div>
            {onClear && (
              <div className="mt-3 border-t border-neutral-100 pt-2 text-right">
                <button
                  type="button"
                  onClick={onClear}
                  disabled={!isActive}
                  className="text-brand-700 hover:text-brand-800 text-xs font-medium underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                >
                  Clear column
                </button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface PopoverFieldProps {
  label: string;
  children: ReactNode;
}

/** A small label + control row used inside ColumnFilter popovers. */
export function PopoverField({ label, children }: PopoverFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

interface PopoverSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

/** Compact `<select>` styled to match the rest of the popover. */
export function PopoverSelect({
  value,
  onChange,
  options,
}: PopoverSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface ColumnHeaderProps {
  label: ReactNode;
  /** Direction this column is currently sorted, if any. */
  sortDirection?: SortDirection | null;
  /** Click handler that cycles the sort state for this column. */
  onSortClick?: () => void;
  /** Optional filter trigger (rendered to the right of the label). */
  filter?: ReactNode;
  /** Align the contents to the end of the cell (used for right-aligned columns). */
  align?: "start" | "end";
}

/**
 * Composable table column header. The label is a sort button (click to
 * cycle asc → desc → asc) and an optional filter popover trigger sits
 * next to it. Use without `onSortClick` for non-sortable columns.
 */
export function ColumnHeader({
  label,
  sortDirection = null,
  onSortClick,
  filter,
  align = "start",
}: ColumnHeaderProps) {
  const isSorted = sortDirection !== null;
  const SortIcon = !isSorted
    ? ChevronsUpDown
    : sortDirection === "asc"
      ? ArrowUp
      : ArrowDown;
  const labelNode = onSortClick ? (
    <button
      type="button"
      onClick={onSortClick}
      className={cn(
        "group inline-flex items-center gap-1 rounded -mx-1 px-1 text-xs font-semibold tracking-wide uppercase transition-colors",
        isSorted
          ? "text-brand-700"
          : "text-neutral-600 hover:text-neutral-900",
      )}
    >
      {label}
      <SortIcon
        className={cn(
          "h-3 w-3 transition-opacity",
          isSorted
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-60",
        )}
      />
    </button>
  ) : (
    <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
      {label}
    </span>
  );
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5",
        align === "end" && "justify-end",
      )}
    >
      {labelNode}
      {filter}
    </div>
  );
}
