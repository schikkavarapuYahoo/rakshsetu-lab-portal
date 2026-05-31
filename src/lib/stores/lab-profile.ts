"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Lab letterhead used on printed / PDF reports. Configured once by the lab
 * owner from Settings → Lab profile, then snapshotted onto every printed
 * report so historical PDFs stay correct even after a future rebrand.
 *
 * No logo upload — paste a hosted URL (or leave blank for a placeholder
 * initial). When a real backend lands, swap this for a server-stored
 * profile + signed-URL uploads.
 */
export interface LabProfile {
  labName: string;
  address: string;
  phone: string;
  email: string;
  /** Optional hosted URL — must be an https:// image. Empty string = use placeholder. */
  logoUrl: string;
  /** Name shown above the signature line on the report footer. */
  signatoryName: string;
  /** e.g. "Pathologist", "Lab In-Charge". */
  signatoryRole: string;
  /**
   * NABL accreditation number (M-XXXX). Printed in the header strip so
   * doctors can independently verify the lab is accredited. Leave blank
   * if not yet accredited.
   */
  nablNumber: string;
  /** Clinical Establishment / state lab registration number. */
  licenseNumber: string;
  /** GSTIN — required for any lab crossing the GST threshold. */
  gstin: string;
  /**
   * WhatsApp Business number the lab sends report links from (e.g. the
   * number registered with Twilio / Gupshup / WhatsApp Cloud API).
   * Display-only until a real provider is wired up — until then the
   * "Send via WhatsApp" action runs in demo mode and just records the
   * audit stamp.
   */
  whatsappBusinessNumber: string;
  /**
   * Message body with mustache-style tokens. Available tokens:
   *   {{patientName}} {{labName}} {{reportCode}} {{testName}}
   *   {{reportLink}} {{signatoryName}}
   * Leave blank to use the built-in default template.
   */
  whatsappTemplate: string;
}

const DEFAULT_WHATSAPP_TEMPLATE =
  "Namaste {{patientName}}, your lab report for {{testName}} ({{reportCode}}) is ready. " +
  "Open here: {{reportLink}}\n\n" +
  "— {{labName}}\nFor questions, reply to this chat.";

const EMPTY_PROFILE: LabProfile = {
  labName: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "",
  signatoryName: "",
  signatoryRole: "",
  nablNumber: "",
  licenseNumber: "",
  gstin: "",
  whatsappBusinessNumber: "",
  whatsappTemplate: "",
};

export { DEFAULT_WHATSAPP_TEMPLATE };

interface LabProfileState {
  profile: LabProfile;
  /** Merge partial fields into the saved profile. */
  updateProfile: (changes: Partial<LabProfile>) => void;
  /** True when the lab has set at least the name — used to gate "ready to print". */
  hasMinimum: () => boolean;
  reset: () => void;
  /** Pull the canonical profile from Firestore. Called at app boot. */
  hydrateFromAPI: () => Promise<void>;
}

// ── camelCase (zustand) ↔ snake_case (API) mapping ──────────────────
const API_KEY_BY_PROFILE_KEY: Record<keyof LabProfile, string> = {
  labName: "lab_name",
  address: "lab_address",
  phone: "lab_phone",
  email: "lab_email",
  logoUrl: "lab_logo_url",
  signatoryName: "authorized_signatory",
  signatoryRole: "signatory_role",
  nablNumber: "nabl_number",
  licenseNumber: "license_number",
  gstin: "gstin",
  whatsappBusinessNumber: "whatsapp_business_number",
  whatsappTemplate: "whatsapp_template",
};
const PROFILE_KEY_BY_API_KEY: Record<string, keyof LabProfile> =
  Object.fromEntries(
    Object.entries(API_KEY_BY_PROFILE_KEY).map(([k, v]) => [v, k as keyof LabProfile]),
  );

function persistProfileRemote(changes: Partial<LabProfile>): void {
  const body: Record<string, string> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (typeof v === "string") {
      body[API_KEY_BY_PROFILE_KEY[k as keyof LabProfile]] = v;
    }
  }
  if (Object.keys(body).length === 0) return;
  void fetch("/api/lab-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) console.warn(`[lab-profile] save failed: ${res.status}`);
  }).catch((err) => {
    console.warn("[lab-profile] save threw:", err);
  });
}

export const useLabProfileStore = create<LabProfileState>()(
  persist(
    (set, get) => ({
      profile: EMPTY_PROFILE,
      updateProfile: (changes) => {
        set((state) => ({ profile: { ...state.profile, ...changes } }));
        persistProfileRemote(changes);
      },
      hasMinimum: () => get().profile.labName.trim() !== "",
      reset: () => set({ profile: EMPTY_PROFILE }),
      hydrateFromAPI: async () => {
        const res = await fetch("/api/lab-settings", { cache: "no-store" });
        if (res.status === 401) return;
        if (!res.ok) throw new Error(`GET /api/lab-settings ${res.status}`);
        const body = (await res.json()) as { profile?: Record<string, string> };
        if (!body.profile) return;
        const next: LabProfile = { ...EMPTY_PROFILE };
        for (const [apiKey, profileKey] of Object.entries(PROFILE_KEY_BY_API_KEY)) {
          const v = body.profile[apiKey];
          if (typeof v === "string") next[profileKey] = v;
        }
        // Skip hydrate when remote is entirely blank — newly-provisioned
        // labs have empty fields and the local cache may have unsaved
        // typing from before this load completed.
        const remoteHasAny = Object.values(next).some(
          (v) => typeof v === "string" && v.trim() !== "",
        );
        if (!remoteHasAny) return;
        set({ profile: next });
      },
    }),
    {
      name: "rakshsetu-lab-profile",
      // v3: added whatsappBusinessNumber + whatsappTemplate for the
      //     WhatsApp delivery flow. Backfill to empty so existing
      //     profiles fall back to the built-in default template.
      // v2: added nablNumber, licenseNumber, gstin for the accreditation
      //     strip printed in the report header.
      version: 3,
      partialize: (state) => ({ profile: state.profile }),
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as
          | { profile?: Partial<LabProfile> }
          | undefined;
        const existing = state?.profile ?? {};
        const withV2: Partial<LabProfile> = {
          ...existing,
          nablNumber: existing.nablNumber ?? "",
          licenseNumber: existing.licenseNumber ?? "",
          gstin: existing.gstin ?? "",
        };
        const withV3: Partial<LabProfile> = {
          ...withV2,
          whatsappBusinessNumber: existing.whatsappBusinessNumber ?? "",
          whatsappTemplate: existing.whatsappTemplate ?? "",
        };
        return {
          profile: { ...EMPTY_PROFILE, ...(fromVersion < 3 ? withV3 : existing) },
        };
      },
    },
  ),
);
