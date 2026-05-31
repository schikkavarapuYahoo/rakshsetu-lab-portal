"use client";

import { useEffect, useState } from "react";

import { LiveClock } from "@/components/common/live-clock";

/**
 * Reusable "Good morning, Siddu" / "Saturday, 23 May 2026 · 4:41 pm"
 * block. Mirrors the dashboard heading so any landing page can wear
 * the same welcome.
 *
 * Renders the static heading on the server with a placeholder date,
 * then swaps to the locale-formatted "Saturday, …" date on the client
 * to avoid a hydration mismatch on locales that disagree between
 * server and client time zones.
 */
interface WelcomeHeaderProps {
  /** Display name. The component uses only the first whitespace-delimited token. */
  name: string;
}

function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function WelcomeHeader({ name }: WelcomeHeaderProps) {
  const firstName = name.split(/\s+/)[0] || "there";
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    setDateLabel(todayLabel());
  }, []);

  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        {greeting()}, {firstName}
      </h1>
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span>{dateLabel ?? " "}</span>
        <span aria-hidden className="text-neutral-300">
          ·
        </span>
        <LiveClock showIcon className="font-medium text-neutral-700" />
      </div>
    </header>
  );
}
