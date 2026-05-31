"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import {
  buildPhoneValue,
  cn,
  COUNTRY_CODES,
  parsePhoneValue,
} from "@/lib/utils";

interface OutlinedPhoneInputProps {
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
  name?: string;
}

export const OutlinedPhoneInput = React.forwardRef<
  HTMLInputElement,
  OutlinedPhoneInputProps
>(
  (
    {
      label = "Phone",
      required,
      helperText,
      error,
      value,
      onChange,
      onBlur,
      id,
      disabled,
      name,
    },
    ref,
  ) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const hasError = Boolean(error);
    const { countryCode, local } = parsePhoneValue(value);

    function handleCountryCode(next: string) {
      onChange(buildPhoneValue(next, local));
    }

    function handleLocalChange(next: string) {
      onChange(buildPhoneValue(countryCode, next));
    }

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <div
            data-error={hasError ? "true" : undefined}
            className={cn(
              "flex w-full items-stretch overflow-hidden rounded-md border border-neutral-300 bg-white transition-colors",
              "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
              "data-[error=true]:border-destructive data-[error=true]:focus-within:ring-destructive/20",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <div className="relative flex items-center">
              <select
                aria-label="Country code"
                value={countryCode}
                onChange={(e) => handleCountryCode(e.target.value)}
                disabled={disabled}
                className={cn(
                  "appearance-none cursor-pointer border-0 bg-transparent pt-5 pb-2 pl-3 pr-7 text-sm font-medium tabular-nums outline-none",
                  "disabled:cursor-not-allowed",
                )}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-muted-foreground pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            </div>
            <div className="my-2 w-px bg-neutral-200" />
            <input
              ref={ref}
              id={inputId}
              name={name}
              type="tel"
              inputMode="numeric"
              placeholder=" "
              value={local}
              onChange={(e) => handleLocalChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              className="block flex-1 border-0 bg-transparent pt-5 pr-3 pb-2 pl-3 text-sm tabular-nums outline-none"
            />
          </div>
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute top-0 left-2.5 bg-white px-1 text-xs font-medium text-neutral-500",
              hasError && "text-destructive",
            )}
          >
            {label}
            {required && <span className="ml-0.5 text-brand-500">*</span>}
          </label>
        </div>
        {hasError ? (
          <p className="text-destructive px-1 text-xs">{error}</p>
        ) : helperText ? (
          <p className="text-muted-foreground px-1 text-xs">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
OutlinedPhoneInput.displayName = "OutlinedPhoneInput";
