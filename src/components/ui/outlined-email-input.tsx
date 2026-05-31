"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const COMMON_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
  "rediffmail.com",
  "protonmail.com",
  "live.com",
] as const;

interface OutlinedEmailInputProps {
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

export const OutlinedEmailInput = React.forwardRef<
  HTMLInputElement,
  OutlinedEmailInputProps
>(
  (
    {
      label = "Email",
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
    const [focused, setFocused] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(0);

    const trimmed = value ?? "";
    const atIndex = trimmed.indexOf("@");
    const localPart = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
    const domainPart = atIndex === -1 ? "" : trimmed.slice(atIndex + 1);

    const suggestions = React.useMemo(() => {
      if (!localPart) return [];
      if (atIndex === -1) {
        return COMMON_DOMAINS.map((d) => `${localPart}@${d}`);
      }
      const matches = COMMON_DOMAINS.filter(
        (d) =>
          d.startsWith(domainPart.toLowerCase()) &&
          d !== domainPart.toLowerCase(),
      );
      return matches.map((d) => `${localPart}@${d}`);
    }, [localPart, domainPart, atIndex]);

    const showSuggestions = focused && suggestions.length > 0;

    React.useEffect(() => {
      if (activeIndex >= suggestions.length) setActiveIndex(0);
    }, [suggestions.length, activeIndex]);

    function selectSuggestion(s: string) {
      onChange(s);
      setFocused(false);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!showSuggestions) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + suggestions.length) % suggestions.length,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        const choice = suggestions[activeIndex];
        if (choice) {
          if (e.key === "Enter") e.preventDefault();
          selectSuggestion(choice);
        }
      } else if (e.key === "Escape") {
        setFocused(false);
      }
    }

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            name={name}
            type="email"
            placeholder=" "
            data-error={hasError ? "true" : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setTimeout(() => setFocused(false), 150);
              onBlur?.();
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            className={cn(
              "peer block w-full rounded-md border border-neutral-300 bg-white px-3 pt-5 pb-2 text-sm text-foreground outline-none transition-colors",
              "hover:border-neutral-400",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
              "data-[error=true]:border-destructive data-[error=true]:focus:ring-destructive/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
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

          {showSuggestions && (
            <ul
              role="listbox"
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-56 overflow-auto rounded-md border border-neutral-200 bg-white shadow-md"
            >
              {suggestions.map((s, idx) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    "cursor-pointer px-3 py-1.5 text-sm",
                    idx === activeIndex
                      ? "bg-brand-50 text-brand-700"
                      : "hover:bg-neutral-50",
                  )}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
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
OutlinedEmailInput.displayName = "OutlinedEmailInput";
