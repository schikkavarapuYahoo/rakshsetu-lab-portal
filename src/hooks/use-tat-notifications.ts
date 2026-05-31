"use client";

import { useEffect, useRef } from "react";

import { useLabCatalogStore } from "@/lib/stores/lab-catalog";
import { useReportsStore } from "@/lib/stores/reports";
import { getTatState } from "@/lib/utils/tat";

/**
 * Watches reports for TAT-overdue transitions and fires native browser
 * notifications. Runs only while the tab is open; reminders for reports
 * already notified about this session are suppressed (the `tag` also helps
 * the browser collapse duplicates if they slip through).
 *
 * The hook reads stores via `getState()` rather than the React adapter so it
 * doesn't trigger re-renders on every tick — only the polling interval drives
 * the work.
 */
export function useTatNotifications(intervalMs: number = 60_000): void {
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    function check() {
      if (Notification.permission !== "granted") return;

      const reports = useReportsStore.getState().reports;
      const tests = useLabCatalogStore.getState().tests;
      const byCode = new Map(tests.map((t) => [t.code.toUpperCase(), t]));
      const now = Date.now();

      for (const r of reports) {
        if (notifiedIds.current.has(r.id)) continue;
        const labTest = r.testCode
          ? byCode.get(r.testCode.toUpperCase())
          : undefined;
        const state = getTatState(r, labTest, now);
        if (state.status !== "overdue") continue;

        const notification = new Notification(
          `Results due — ${r.testName}`,
          {
            body: `${r.reportCode} is overdue. Enter results or check the analyzer.`,
            tag: `tat-${r.id}`,
          },
        );
        notification.onclick = () => {
          window.focus();
          window.location.href = `/reports/${r.id}`;
          notification.close();
        };
        notifiedIds.current.add(r.id);
      }
    }

    check();
    const id = window.setInterval(check, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}
