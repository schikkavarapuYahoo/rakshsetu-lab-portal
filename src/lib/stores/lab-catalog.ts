"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  MASTER_TEST_LIBRARY,
  MASTER_TEST_BY_CODE,
  type MasterTestParameter,
  type SampleType,
  type TestCategory,
  type TubeColor,
} from "@/config/master-tests";
import { getCurrentUserSnapshot } from "@/lib/stores/auth";
import type { AuditStamp } from "@/lib/stores/patients";

// ────────────────────────────────────────────────────────────────────────────
//  TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * A test in the lab's own catalog. Either cloned from the master library
 * (`source: "master"`) or fully custom. Once cloned, the lab can override
 * name, code, parameters, units and reference ranges to match the analyzer
 * the lab actually owns. The original master row stays untouched.
 *
 * Reports do NOT carry a foreign key to a `LabTest.id`. Each `Report.results`
 * row already snapshots the parameter, unit and reference range as plain
 * strings at creation time, so historical reports stay correct even if the
 * lab later edits or disables the test.
 */
export interface LabTest {
  id: string;
  source: "master" | "custom";
  /** Set only when `source === "master"`. Links back to the seed row. */
  masterCode?: string;
  /** Catalog code shown on reports and PDFs. Defaults to the master code. */
  code: string;
  name: string;
  category: TestCategory;
  description?: string;
  parameters: MasterTestParameter[];
  isActive: boolean;
  /** Lab-set price in INR. Used by Phase 2 billing. */
  basePrice?: number;
  /**
   * Expected turnaround time in minutes, measured from sample collection.
   * Drives "due now" reminders. Defaults to the master library value for
   * master-derived tests; required for custom tests.
   */
  turnaroundMinutes: number;
  /** What the technician should physically collect from the patient. */
  sampleType: SampleType;
  /** Blood-collection tube colour, or `None / Container` for non-blood. */
  tubeColor: TubeColor;
  /**
   * Patient prep instructions shown at the counter when this test is
   * picked. Empty string if no special prep is needed.
   */
  patientPrep: string;
  createdAt: string;
  createdBy: AuditStamp;
  updatedAt: string;
  updatedBy: AuditStamp;
}

export interface NewCustomTestInput {
  name: string;
  code: string;
  category: TestCategory;
  description?: string;
  parameters: MasterTestParameter[];
  basePrice?: number;
  turnaroundMinutes: number;
  sampleType: SampleType;
  tubeColor: TubeColor;
  patientPrep: string;
}

export type UpdateLabTestInput = Partial<
  Omit<
    LabTest,
    | "id"
    | "source"
    | "masterCode"
    | "createdAt"
    | "createdBy"
    | "updatedAt"
    | "updatedBy"
  >
>;

// ────────────────────────────────────────────────────────────────────────────
//  SEED
// ────────────────────────────────────────────────────────────────────────────

const SEED_STAMP: AuditStamp = {
  userId: "u-seed",
  userName: "Seed Data",
  at: "2026-04-01T09:00:00.000Z",
};

/** Plausible Indian-lab pricing per master code — seeded only. Labs can edit. */
const SEED_PRICES: Record<string, number> = {
  // Core 10
  CBC: 350,
  LIPID: 800,
  HBA1C: 500,
  "TSH-T3-T4": 900,
  LFT: 700,
  KFT: 650,
  "URINE-R": 200,
  ESR: 150,
  "VIT-D": 1500,
  "VIT-B12": 1200,
  // Glucose / Diabetes
  FBS: 100,
  PPBS: 100,
  RBS: 100,
  OGTT: 400,
  // Coagulation + blood bank
  "BG-RH": 200,
  "PT-INR": 350,
  APTT: 350,
  // Extended biochemistry
  "CA-SERUM": 200,
  "MG-SERUM": 250,
  PHOS: 200,
  IRON: 350,
  FERRITIN: 700,
  AMYLASE: 400,
  LIPASE: 500,
  ALBUMIN: 200,
  // Hormones
  "BETA-HCG": 700,
  PROLACTIN: 600,
  LH: 600,
  FSH: 600,
  "TESTO-TOTAL": 800,
  "INSULIN-F": 700,
  "CORTISOL-AM": 800,
  // Cardiac
  "TROP-I": 1200,
  "CK-MB": 600,
  // Serology
  WIDAL: 300,
  "DENGUE-NS1": 800,
  "MALARIA-AG": 250,
  HIV: 600,
  HBSAG: 350,
  "ANTI-HCV": 800,
  // Inflammation + autoimmune
  CRP: 400,
  ASO: 350,
  "RA-FACTOR": 400,
  // Cancer markers
  "PSA-TOTAL": 800,
  // Microbiology
  "URINE-CULT": 600,
  "STOOL-R": 200,
  "STOOL-OB": 250,
};

export const seedLabTests: LabTest[] = MASTER_TEST_LIBRARY.map((m, idx) => ({
  id: `lt-seed-${String(idx + 1).padStart(3, "0")}`,
  source: "master",
  masterCode: m.code,
  code: m.code,
  name: m.name,
  category: m.category,
  description: m.description,
  // Deep clone so later edits to one don't mutate the master library.
  parameters: m.parameters.map((p) => ({ ...p })),
  isActive: true,
  basePrice: SEED_PRICES[m.code],
  turnaroundMinutes: m.turnaroundMinutes,
  sampleType: m.sampleType,
  tubeColor: m.tubeColor,
  patientPrep: m.patientPrep,
  createdAt: SEED_STAMP.at,
  createdBy: SEED_STAMP,
  updatedAt: SEED_STAMP.at,
  updatedBy: SEED_STAMP,
}));

// ────────────────────────────────────────────────────────────────────────────
//  STORE
// ────────────────────────────────────────────────────────────────────────────

function currentStamp(): AuditStamp {
  const user = getCurrentUserSnapshot();
  return { userId: user.id, userName: user.name, at: new Date().toISOString() };
}

interface LabCatalogState {
  tests: LabTest[];
  /** Add a test from the master library to this lab's catalog. */
  addFromMaster: (masterCode: string) => LabTest;
  /** Create a fully custom test (not derived from the master library). */
  addCustomTest: (input: NewCustomTestInput) => LabTest;
  updateTest: (id: string, changes: UpdateLabTestInput) => LabTest;
  setActive: (id: string, isActive: boolean) => LabTest;
  deleteTest: (id: string) => void;
  getById: (id: string) => LabTest | undefined;
  getByCode: (code: string) => LabTest | undefined;
  reset: () => void;
  /**
   * Replace the local catalog with the lab's persisted Firestore
   * snapshot. Runs at app boot via `StoreHydrationDriver`. Falls back
   * to the existing local state if the lab has never persisted (first
   * launch) or the server returns an error.
   */
  hydrateFromAPI: () => Promise<void>;
}

/**
 * Fire-and-forget persistence of the whole `tests` array. Whole-array
 * semantics keeps the wiring simple — every mutating action just calls
 * this with the post-mutation state and we PUT the snapshot. Last
 * write wins on concurrent edits, which is fine at pilot scale.
 */
function persistCatalogRemote(tests: LabTest[]): void {
  void fetch("/api/lab-catalog", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tests }),
  })
    .then((res) => {
      if (!res.ok) {
        console.warn(`[lab-catalog] PUT failed: ${res.status}`);
      }
    })
    .catch((err) => {
      console.warn("[lab-catalog] PUT threw:", err);
    });
}

export const useLabCatalogStore = create<LabCatalogState>()(
  persist(
    (set, get) => ({
      tests: seedLabTests,

      addFromMaster: (masterCode) => {
        const master = MASTER_TEST_BY_CODE[masterCode];
        if (!master) {
          throw new Error(`Master test not found: ${masterCode}`);
        }
        const existing = get().tests.find(
          (t) => t.masterCode === masterCode,
        );
        if (existing) {
          // Already enabled at some point. If inactive, flip it back on.
          if (!existing.isActive) {
            return get().setActive(existing.id, true);
          }
          return existing;
        }
        const stamp = currentStamp();
        const test: LabTest = {
          id: crypto.randomUUID(),
          source: "master",
          masterCode: master.code,
          code: master.code,
          name: master.name,
          category: master.category,
          description: master.description,
          parameters: master.parameters.map((p) => ({ ...p })),
          isActive: true,
          basePrice: SEED_PRICES[master.code],
          turnaroundMinutes: master.turnaroundMinutes,
          sampleType: master.sampleType,
          tubeColor: master.tubeColor,
          patientPrep: master.patientPrep,
          createdAt: stamp.at,
          createdBy: stamp,
          updatedAt: stamp.at,
          updatedBy: stamp,
        };
        set((state) => {
          const next = [...state.tests, test];
          persistCatalogRemote(next);
          return { tests: next };
        });
        return test;
      },

      addCustomTest: (input) => {
        const code = input.code.trim().toUpperCase();
        if (!code) {
          throw new Error("Custom test code is required");
        }
        const codeClash = get().tests.find(
          (t) => t.code.toUpperCase() === code,
        );
        if (codeClash) {
          throw new Error(
            `A test with code "${codeClash.code}" already exists in this lab's catalog`,
          );
        }
        const stamp = currentStamp();
        const test: LabTest = {
          id: crypto.randomUUID(),
          source: "custom",
          code,
          name: input.name.trim(),
          category: input.category,
          description: input.description?.trim() || undefined,
          parameters: input.parameters.map((p) => ({ ...p })),
          isActive: true,
          basePrice: input.basePrice,
          turnaroundMinutes: input.turnaroundMinutes,
          sampleType: input.sampleType,
          tubeColor: input.tubeColor,
          patientPrep: input.patientPrep.trim(),
          createdAt: stamp.at,
          createdBy: stamp,
          updatedAt: stamp.at,
          updatedBy: stamp,
        };
        set((state) => {
          const next = [...state.tests, test];
          persistCatalogRemote(next);
          return { tests: next };
        });
        return test;
      },

      updateTest: (id, changes) => {
        const existing = get().tests.find((t) => t.id === id);
        if (!existing) throw new Error(`Lab test not found: ${id}`);
        const stamp = currentStamp();
        const updated: LabTest = {
          ...existing,
          ...changes,
          id: existing.id,
          source: existing.source,
          masterCode: existing.masterCode,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: stamp.at,
          updatedBy: stamp,
        };
        set((state) => {
          const next = state.tests.map((t) => (t.id === id ? updated : t));
          persistCatalogRemote(next);
          return { tests: next };
        });
        return updated;
      },

      setActive: (id, isActive) => {
        const existing = get().tests.find((t) => t.id === id);
        if (!existing) throw new Error(`Lab test not found: ${id}`);
        if (existing.isActive === isActive) return existing;
        const stamp = currentStamp();
        const updated: LabTest = {
          ...existing,
          isActive,
          updatedAt: stamp.at,
          updatedBy: stamp,
        };
        set((state) => {
          const next = state.tests.map((t) => (t.id === id ? updated : t));
          persistCatalogRemote(next);
          return { tests: next };
        });
        return updated;
      },

      deleteTest: (id) =>
        set((state) => {
          const next = state.tests.filter((t) => t.id !== id);
          persistCatalogRemote(next);
          return { tests: next };
        }),

      getById: (id) => get().tests.find((t) => t.id === id),

      getByCode: (code) =>
        get().tests.find(
          (t) => t.code.toUpperCase() === code.toUpperCase(),
        ),

      reset: () => {
        set({ tests: seedLabTests });
        persistCatalogRemote(seedLabTests);
      },

      hydrateFromAPI: async () => {
        const res = await fetch("/api/lab-catalog", { cache: "no-store" });
        if (res.status === 401) return;
        if (!res.ok) throw new Error(`GET /api/lab-catalog ${res.status}`);
        const body = (await res.json()) as { tests?: LabTest[] };
        const tests = body.tests ?? [];
        // First-launch: server has no snapshot yet → keep the locally
        // seeded catalog so the lab sees the 47 master tests. The next
        // mutation will write the snapshot for the first time.
        if (tests.length === 0) return;
        // Self-heal master-sourced tests that were persisted with an empty
        // parameters array (real data we've seen in pilot labs — a saved
        // catalog row with `parameters: []` for CBC means new reports get
        // no parameter rows, no units, no ranges). Master-sourced rows are
        // always derivable from the master library by code, so an empty
        // array is unambiguously a data bug worth quietly fixing on read.
        // Custom tests are left alone — empty there is a user choice.
        const healed = tests.map((t) => {
          if (
            t.source === "master" &&
            t.masterCode &&
            (t.parameters?.length ?? 0) === 0
          ) {
            const master = MASTER_TEST_BY_CODE[t.masterCode];
            if (master) {
              return { ...t, parameters: master.parameters.map((p) => ({ ...p })) };
            }
          }
          return t;
        });
        set({ tests: healed });
        // Persist the heal so the server snapshot matches what every
        // client now sees, and so future hydrations are no-ops. Fire and
        // forget — a failed save just means the next hydration will heal
        // again, which is harmless.
        const anyHealed = healed.some((h, i) => h !== tests[i]);
        if (anyHealed) persistCatalogRemote(healed);
      },
    }),
    {
      name: "rakshsetu-lab-catalog",
      // v4: merge any new derived parameters added to the master library
      //     into existing master-derived tests. LIPID gained VLDL +
      //     Total/HDL Ratio; LFT gained Direct + Indirect Bilirubin,
      //     Total Protein, Albumin, Globulin, A/G Ratio. Without this
      //     existing labs upgrading would never see the new rows.
      //     Identifies "new" rows by parameter name; only adds, never
      //     removes — preserves any custom edits the lab made.
      // v3: added required `sampleType`, `tubeColor`, `patientPrep`.
      //     Master-derived rows backfill from the master library by code;
      //     custom rows fall back to "Whole Blood" / "Lavender (EDTA)" /
      //     empty prep so they remain valid until a lab edits them.
      // v2: added required `turnaroundMinutes`. Backfilled from the master
      //     library for master-derived tests; custom tests fall back to a
      //     60-minute default so existing custom rows don't break.
      version: 4,
      partialize: (state) => ({ tests: state.tests }),
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as { tests?: Partial<LabTest>[] };
        if (!state?.tests) return { tests: seedLabTests };

        if (fromVersion < 2) {
          state.tests = state.tests.map((t) => {
            if (typeof t.turnaroundMinutes === "number") return t;
            const masterTat = t.masterCode
              ? MASTER_TEST_BY_CODE[t.masterCode]?.turnaroundMinutes
              : undefined;
            return { ...t, turnaroundMinutes: masterTat ?? 60 };
          });
        }

        if (fromVersion < 3) {
          state.tests = state.tests.map((t) => {
            const master = t.masterCode
              ? MASTER_TEST_BY_CODE[t.masterCode]
              : undefined;
            return {
              ...t,
              sampleType: t.sampleType ?? master?.sampleType ?? "Whole Blood",
              tubeColor:
                t.tubeColor ?? master?.tubeColor ?? "Lavender (EDTA)",
              patientPrep: t.patientPrep ?? master?.patientPrep ?? "",
            };
          });
        }

        if (fromVersion < 4) {
          state.tests = state.tests.map((t) => {
            if (t.source !== "master" || !t.masterCode) return t;
            const master = MASTER_TEST_BY_CODE[t.masterCode];
            if (!master) return t;
            const existingNames = new Set(
              (t.parameters ?? []).map((p) => p.parameter),
            );
            const additions = master.parameters.filter(
              (p) => !existingNames.has(p.parameter),
            );
            if (additions.length === 0) return t;
            return {
              ...t,
              parameters: [...(t.parameters ?? []), ...additions],
            };
          });
        }

        return { tests: state.tests as LabTest[] };
      },
    },
  ),
);
