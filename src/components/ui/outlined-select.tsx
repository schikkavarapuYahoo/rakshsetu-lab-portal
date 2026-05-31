"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface OutlinedSelectProps {
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  options: { value: string; label: string; hint?: string }[];
  id?: string;
  className?: string;
}

export function OutlinedSelect({
  label,
  required,
  helperText,
  error,
  placeholder = " ",
  value,
  defaultValue,
  onValueChange,
  options,
  id,
  className,
}: OutlinedSelectProps) {
  const reactId = React.useId();
  const selectId = id ?? reactId;
  const hasError = Boolean(error);

  const labelByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of options) map.set(o.value, o.label);
    return map;
  }, [options]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Select
          value={value ?? null}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
        >
          <SelectTrigger
            id={selectId}
            data-error={hasError ? "true" : undefined}
            className={cn(
              "peer block w-full rounded-md! border border-neutral-300 bg-white px-3! pt-5! pb-2! text-left text-sm shadow-none outline-none transition-colors",
              "data-[size=default]:h-auto",
              "hover:border-neutral-400",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
              "focus-visible:ring-2 focus-visible:ring-brand-500/20 focus-visible:border-brand-500",
              "data-[error=true]:border-destructive data-[error=true]:focus:ring-destructive/20",
              className,
            )}
          >
            <SelectValue placeholder={placeholder}>
              {(v) => (v ? (labelByValue.get(String(v)) ?? String(v)) : "")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.hint && (
                  <span className="mr-2 font-mono text-xs text-neutral-500">
                    {opt.hint}
                  </span>
                )}
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label
          htmlFor={selectId}
          className="pointer-events-none absolute top-0 left-2.5 bg-white px-1 text-xs font-medium text-neutral-500 peer-focus:text-brand-600 peer-data-[error=true]:text-destructive"
        >
          {label}
          {required && <span className="ml-0.5 text-brand-500">*</span>}
        </label>
      </div>
      {hasError ? (
        <p className="px-1 text-xs text-destructive">{error}</p>
      ) : helperText ? (
        <p className="text-muted-foreground px-1 text-xs">{helperText}</p>
      ) : null}
    </div>
  );
}
