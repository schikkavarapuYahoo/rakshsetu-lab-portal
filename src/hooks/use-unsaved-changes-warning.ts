"use client";

import { useEffect } from "react";

/**
 * Warns the user before closing/refreshing the tab if `dirty` is true.
 * Only covers full-page navigations (close, refresh, external link).
 * For in-app navigation (links, router.push), call `confirmDiscard()` manually.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * Synchronously confirms the user wants to discard unsaved form changes.
 * Returns true if the navigation should proceed.
 */
export function confirmDiscard(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm(
    "You have unsaved changes. Are you sure you want to leave?",
  );
}
