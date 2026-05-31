"use client";

import { useEffect, useState } from "react";

/**
 * Returns `Date.now()` and re-renders the component on a fixed interval, so
 * time-dependent UI (TAT chips, relative-time labels) stays current without
 * needing manual refresh. SSR-safe: the first render uses `0` so server and
 * client agree, then the real time arrives in the first effect tick.
 */
export function useTickingNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
