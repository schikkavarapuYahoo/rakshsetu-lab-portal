"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface OutlinedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
}

export const OutlinedInput = React.forwardRef<
  HTMLInputElement,
  OutlinedInputProps
>(
  (
    { label, required, helperText, error, className, id, ...props },
    ref,
  ) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            placeholder=" "
            data-error={hasError ? "true" : undefined}
            className={cn(
              "peer block w-full rounded-md border border-neutral-300 bg-white px-3 pt-5 pb-2 text-sm text-foreground outline-none transition-colors",
              "hover:border-neutral-400",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
              "data-[error=true]:border-destructive data-[error=true]:focus:ring-destructive/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...props}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute top-1/2 left-2.5 origin-left -translate-y-1/2 bg-white px-1 text-sm text-neutral-500 transition-all duration-150",
              "peer-focus:top-0 peer-focus:text-xs peer-focus:font-medium peer-focus:text-brand-600",
              "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium",
              "peer-data-[error=true]:text-destructive",
            )}
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
  },
);
OutlinedInput.displayName = "OutlinedInput";
