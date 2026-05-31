"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/lib/stores/auth";
import { useBillingStore } from "@/lib/stores/billing";
import { useLabCatalogStore } from "@/lib/stores/lab-catalog";
import { useLabProfileStore } from "@/lib/stores/lab-profile";
import { usePatientsStore } from "@/lib/stores/patients";
import { useReportsStore } from "@/lib/stores/reports";

/**
 * One-shot driver that swaps the localStorage-cached store state for
 * the canonical Firestore data on app boot. Each store hydrates
 * independently — a failure in one doesn't block the others.
 *
 * Both stores' `hydrateFromAPI` preserves a populated local cache when
 * the API returns an empty list (covers the moment between a write
 * firing optimistically and its background persist committing).
 *
 * Errors land in the console; the UI keeps working off the persisted
 * state. We do NOT show a toast — a 401 during the auth handshake or
 * a transient network blip would be noisier than useful.
 */
export function StoreHydrationDriver() {
  useEffect(() => {
    // Auth hydrates first so subsequent stores can attribute audit
    // entries to the real lab name rather than the "Siddu (Demo)"
    // placeholder. Failing this is non-fatal — the rest still works.
    void useAuthStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] auth fell back to demo user:", err);
      });

    void usePatientsStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] patients fell back to cache:", err);
      });

    void useReportsStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] reports fell back to cache:", err);
      });

    void useLabProfileStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] lab profile fell back to cache:", err);
      });

    void useLabCatalogStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] lab catalog fell back to cache:", err);
      });

    void useBillingStore
      .getState()
      .hydrateFromAPI()
      .catch((err) => {
        console.warn("[hydration] billing fell back to cache:", err);
      });
  }, []);

  return null;
}
