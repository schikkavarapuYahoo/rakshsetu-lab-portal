"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getCurrentUserSnapshot } from "@/lib/stores/auth";
import { toTitleCase } from "@/lib/utils";

export type Gender = "Male" | "Female" | "Other";

export interface AuditStamp {
  userId: string;
  userName: string;
  at: string;
}

export interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: Gender;
  age: number;
  dateOfBirth?: string;
  phone: string;
  email?: string;
  address?: string;
  /**
   * Most recent moment this patient walked into the lab — set whenever a
   * new report is created for them. ISO datetime, not a date-only string.
   * Undefined only for patients who have never visited yet (new registrations).
   */
  lastVisit?: string;
  /**
   * Latest recorded vitals. Captured on registration and refreshed at
   * each check-in (start of a new visit). One canonical value per patient
   * — trend history is a Phase-2 concern once we have the DB.
   */
  heightCm?: number;
  weightKg?: number;
  reportCount: number;
  createdAt: string;
  createdBy: AuditStamp;
  updatedAt: string;
  updatedBy: AuditStamp;
}

export interface NewPatientInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
  age?: string;
  phone: string;
  email?: string;
  address?: string;
  /** Height in centimetres; entered as a string from the form. */
  heightCm?: string;
  /** Weight in kilograms; entered as a string from the form. */
  weightKg?: string;
}

/** Vitals snapshot recorded at check-in (new-report flow). */
export interface PatientVitals {
  heightCm?: number;
  weightKg?: number;
}

const SEED_STAMP: AuditStamp = {
  userId: "u-seed",
  userName: "Seed Data",
  at: "2026-04-01T09:00:00.000Z",
};

type SeedInput = Omit<
  Patient,
  "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

const seedPatientsRaw: SeedInput[] = [
  {
    id: "1",
    patientCode: "P10001",
    firstName: "Rakesh",
    lastName: "Sharma",
    gender: "Male",
    age: 34,
    phone: "+91 98765 43210",
    email: "rakesh.sharma@example.com",
    lastVisit: "2026-05-15",
    reportCount: 8,
  },
  {
    id: "2",
    patientCode: "P10002",
    firstName: "Priya",
    lastName: "Patel",
    gender: "Female",
    age: 28,
    phone: "+91 98765 12345",
    email: "priya.patel@example.com",
    lastVisit: "2026-05-14",
    reportCount: 3,
  },
  {
    id: "3",
    patientCode: "P10003",
    firstName: "Anil",
    middleName: "Kumar",
    lastName: "Reddy",
    gender: "Male",
    age: 52,
    phone: "+91 99887 76655",
    lastVisit: "2026-05-12",
    reportCount: 15,
  },
  {
    id: "4",
    patientCode: "P10004",
    firstName: "Sunita",
    lastName: "Iyer",
    gender: "Female",
    age: 41,
    phone: "+91 91234 56789",
    email: "sunita.iyer@example.com",
    lastVisit: "2026-05-10",
    reportCount: 5,
  },
  {
    id: "5",
    patientCode: "P10005",
    firstName: "Mohammed",
    lastName: "Khan",
    gender: "Male",
    age: 47,
    phone: "+91 98123 45678",
    lastVisit: "2026-05-08",
    reportCount: 11,
  },
  {
    id: "6",
    patientCode: "P10006",
    firstName: "Lakshmi",
    lastName: "Nair",
    gender: "Female",
    age: 36,
    phone: "+91 97654 32109",
    email: "lakshmi.nair@example.com",
    lastVisit: "2026-05-05",
    reportCount: 2,
  },
  {
    id: "7",
    patientCode: "P10007",
    firstName: "Vikram",
    lastName: "Singh",
    gender: "Male",
    age: 29,
    phone: "+91 99999 11111",
    lastVisit: "2026-04-28",
    reportCount: 1,
  },
  {
    id: "8",
    patientCode: "P10008",
    firstName: "Anjali",
    lastName: "Verma",
    gender: "Female",
    age: 23,
    phone: "+91 90000 88888",
    email: "anjali.verma@example.com",
    reportCount: 0,
  },
];

export const seedPatients: Patient[] = seedPatientsRaw.map((p) => ({
  ...p,
  // Every seeded patient gets at least a registration-time "last visit" so
  // the column is never NULL (matches DB-side `NOT NULL` once we migrate).
  lastVisit: p.lastVisit ?? SEED_STAMP.at,
  createdAt: SEED_STAMP.at,
  createdBy: SEED_STAMP,
  updatedAt: SEED_STAMP.at,
  updatedBy: SEED_STAMP,
}));

const genderMap: Record<NewPatientInput["gender"], Gender> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-+]/g, "");
}

/**
 * Convert a string vitals input (from the form) to a positive number,
 * or `undefined` if the field was empty / not a meaningful value. Used
 * for height / weight on patient registration + check-in.
 */
function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameName(a: Patient, input: NewPatientInput): boolean {
  return (
    normalizeName(a.firstName) === normalizeName(input.firstName) &&
    normalizeName(a.lastName) === normalizeName(input.lastName)
  );
}

export interface DuplicateMatch {
  /** Name + DOB + phone all match. Hard block — must use update flow. */
  exact: Patient[];
  /** Same name + same phone (different DOB). Very strong. */
  strict: Patient[];
  /** Same phone, different name. Family/NRI shared phone. */
  sharedPhone: Patient[];
  /** Same name + same DOB, different phone. Possible coincidence. */
  nameDob: Patient[];
}

export function firstMatch(m: DuplicateMatch): Patient | undefined {
  return m.exact[0] ?? m.strict[0] ?? m.nameDob[0] ?? m.sharedPhone[0];
}

export function matchSeverity(
  m: DuplicateMatch,
): "exact" | "strict" | "nameDob" | "shared" | null {
  if (m.exact.length) return "exact";
  if (m.strict.length) return "strict";
  if (m.nameDob.length) return "nameDob";
  if (m.sharedPhone.length) return "shared";
  return null;
}

export class DuplicatePatientError extends Error {
  constructor(public existing: Patient) {
    super(`Patient ${existing.patientCode} already exists`);
    this.name = "DuplicatePatientError";
  }
}

export interface AddPatientOptions {
  /**
   * Set to true to override any duplicate match (strict, shared phone, or
   * name+DOB) and proceed. The user must have explicitly confirmed in the UI.
   */
  allowOverride?: boolean;
}

export type UpdatePatientInput = Partial<
  Omit<
    Patient,
    | "id"
    | "patientCode"
    | "createdAt"
    | "createdBy"
    | "updatedAt"
    | "updatedBy"
  >
>;

export interface UpdatePatientOptions {
  /** Set to true to override any duplicate match and proceed. */
  allowOverride?: boolean;
}

interface PatientsState {
  patients: Patient[];
  nextCode: number;
  addPatient: (input: NewPatientInput, opts?: AddPatientOptions) => Promise<Patient>;
  updatePatient: (
    id: string,
    changes: UpdatePatientInput,
    opts?: UpdatePatientOptions,
  ) => Patient;
  /**
   * Stamp the patient's `lastVisit` to the given ISO datetime. Called from
   * the reports store whenever a new report is created so the column is
   * never NULL after a real visit. No-op if the patient ID isn't found.
   */
  setLastVisit: (id: string, at: string) => void;
  /**
   * Update the patient's vitals (height / weight). Called from the
   * new-report check-in flow so the latest weight is on file each visit.
   * Undefined values are kept as-is (omit-instead-of-clear semantics).
   */
  setVitals: (id: string, vitals: PatientVitals) => void;
  getById: (id: string) => Patient | undefined;
  findDuplicates: (
    input: Partial<NewPatientInput>,
    excludeId?: string,
  ) => DuplicateMatch;
  reset: () => void;
  /**
   * Replace the in-memory list with the result of `GET /api/patients`.
   * Used at app boot to swap the persisted localStorage cache for the
   * canonical Firestore data. Throws if the request fails so callers
   * can fall back to the cached state.
   */
  hydrateFromAPI: () => Promise<void>;
}

function currentStamp(): AuditStamp {
  const user = getCurrentUserSnapshot();
  return {
    userId: user.id,
    userName: user.name,
    at: new Date().toISOString(),
  };
}

export const usePatientsStore = create<PatientsState>()(
  persist(
    (set, get) => ({
  // Empty initial state — Firestore is the source of truth, hydrated
  // via `hydrateFromAPI()` at boot. The `seedPatients` export below is
  // dev-only and consumed by `scripts/seed-emulator.ts`; it must NOT
  // appear in the UI's startup state or a fresh pilot lab would see
  // 8 ghost demo patients before they register anyone.
  patients: [],
  nextCode: 10001,
  addPatient: async (input, opts) => {
    // Client-side pre-flight dedupe — fast feedback before the round trip.
    // The server's `resolveOrCreatePatient` is still the source of truth
    // (phone-based) and will return the existing uid on multi-device
    // races the client cache hasn't seen yet.
    const match = get().findDuplicates(input);
    if (match.exact[0]) {
      throw new DuplicatePatientError(match.exact[0]);
    }
    const top = firstMatch(match);
    if (top && !opts?.allowOverride) {
      throw new DuplicatePatientError(top);
    }

    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Could not register patient (${res.status})`);
    }
    const { patient } = (await res.json()) as { patient: Patient };

    // Replace any local row with the same id (race against hydration)
    // and prepend the new patient so the list shows it on top.
    set((state) => {
      const without = state.patients.filter((p) => p.id !== patient.id);
      const codeNum = Number(patient.patientCode.replace(/^P/, "")) || 0;
      return {
        patients: [patient, ...without],
        nextCode: Math.max(state.nextCode, codeNum + 1),
      };
    });

    return patient;
  },
  updatePatient: (id, changes, opts) => {
    const existing = get().patients.find((p) => p.id === id);
    if (!existing) {
      throw new Error(`Patient not found: ${id}`);
    }
    const normalizedChanges: UpdatePatientInput = { ...changes };
    if (typeof normalizedChanges.firstName === "string") {
      normalizedChanges.firstName = toTitleCase(
        normalizedChanges.firstName.trim(),
      );
    }
    if (typeof normalizedChanges.middleName === "string") {
      const t = normalizedChanges.middleName.trim();
      normalizedChanges.middleName = t ? toTitleCase(t) : undefined;
    }
    if (typeof normalizedChanges.lastName === "string") {
      normalizedChanges.lastName = toTitleCase(
        normalizedChanges.lastName.trim(),
      );
    }
    const merged = { ...existing, ...normalizedChanges };
    const match = get().findDuplicates(
      {
        firstName: merged.firstName,
        lastName: merged.lastName,
        phone: merged.phone,
        dateOfBirth: merged.dateOfBirth,
      },
      id,
    );
    if (match.exact[0]) {
      throw new DuplicatePatientError(match.exact[0]);
    }
    const top = firstMatch(match);
    if (top && !opts?.allowOverride) {
      throw new DuplicatePatientError(top);
    }
    const stamp = currentStamp();
    const updated: Patient = {
      ...existing,
      ...normalizedChanges,
      id: existing.id,
      patientCode: existing.patientCode,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: stamp.at,
      updatedBy: stamp,
    };
    set((state) => ({
      patients: state.patients.map((p) => (p.id === id ? updated : p)),
    }));
    // Persist to Firestore in the background — local cache already
    // reflects the change. On a network failure, the next reload
    // re-hydrates from server state and reconciles.
    void fetch(`/api/patients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalizedChanges),
    }).then((res) => {
      if (!res.ok) console.warn(`[patients] PATCH ${id} failed: ${res.status}`);
    }).catch((err) => {
      console.warn(`[patients] PATCH ${id} threw:`, err);
    });
    return updated;
  },
  setLastVisit: (id, at) => {
    const existing = get().patients.find((p) => p.id === id);
    if (!existing) return;
    // Never roll backwards — if a later report somehow predates the existing
    // stamp (clock skew, manual back-dating), keep the newer one.
    if (existing.lastVisit && existing.lastVisit > at) return;
    const stamp = currentStamp();
    set((state) => ({
      patients: state.patients.map((p) =>
        p.id === id
          ? { ...p, lastVisit: at, updatedAt: stamp.at, updatedBy: stamp }
          : p,
      ),
    }));
  },
  setVitals: (id, vitals) => {
    const existing = get().patients.find((p) => p.id === id);
    if (!existing) return;
    // Omit-instead-of-clear semantics: an undefined value means "no
    // change", not "wipe". The caller passes `undefined` for fields the
    // technician didn't enter at this check-in.
    if (vitals.heightCm === undefined && vitals.weightKg === undefined) return;
    const stamp = currentStamp();
    set((state) => ({
      patients: state.patients.map((p) =>
        p.id === id
          ? {
              ...p,
              heightCm: vitals.heightCm ?? p.heightCm,
              weightKg: vitals.weightKg ?? p.weightKg,
              updatedAt: stamp.at,
              updatedBy: stamp,
            }
          : p,
      ),
    }));
  },
  getById: (id) => get().patients.find((p) => p.id === id),
  findDuplicates: (input, excludeId) => {
    const patients = get().patients;
    const phone = input.phone ? normalizePhone(input.phone) : "";
    const hasFullName = Boolean(input.firstName && input.lastName);
    const dob = input.dateOfBirth ?? "";

    const exact: Patient[] = [];
    const strict: Patient[] = [];
    const sharedPhone: Patient[] = [];
    const nameDob: Patient[] = [];

    for (const p of patients) {
      if (excludeId && p.id === excludeId) continue;
      const phoneMatches =
        phone.length >= 10 && normalizePhone(p.phone) === phone;
      const nameMatches =
        hasFullName && sameName(p, input as NewPatientInput);
      const dobMatches = Boolean(
        dob && p.dateOfBirth && p.dateOfBirth === dob,
      );

      if (nameMatches && phoneMatches && dobMatches) {
        exact.push(p);
        continue;
      }
      if (nameMatches && phoneMatches) {
        strict.push(p);
        continue;
      }
      if (nameMatches && dobMatches) {
        nameDob.push(p);
        continue;
      }
      if (phoneMatches && !nameMatches) {
        sharedPhone.push(p);
      }
    }

    return { exact, strict, sharedPhone, nameDob };
  },
  reset: () => set({ patients: [], nextCode: 10001 }),
  hydrateFromAPI: async () => {
    const res = await fetch("/api/patients", { cache: "no-store" });
    // 401 = no session yet (user is on /login). Stay on cached state
    // silently — the driver will retry on next mount after login.
    if (res.status === 401) return;
    if (!res.ok) {
      throw new Error(`GET /api/patients ${res.status}`);
    }
    const body = (await res.json()) as { patients?: Patient[] };
    const patients = body.patients ?? [];
    // Empty Firestore must NOT clobber a populated local store. UI
    // writes (addPatient) currently only persist to localStorage —
    // they don't reach Firestore until Phase 2. So if the API returns
    // [], a hydration after a refresh would wipe whatever the
    // technician just typed in. Skip the replace until there is
    // genuine remote data to merge.
    if (patients.length === 0) return;
    // Recompute nextCode from the highest seen patientCode so subsequent
    // local adds don't collide with existing rows.
    const maxCode = patients.reduce((acc, p) => {
      const n = Number(p.patientCode.replace(/^P/, "")) || 0;
      return n > acc ? n : acc;
    }, 10000);
    set({ patients, nextCode: maxCode + 1 });
  },
    }),
    {
      name: "rakshsetu-patients",
      // v4: backfill `lastVisit` for any persisted patient that doesn't have
      // one — DB equivalent will be a NOT NULL column, and we shouldn't
      // render "—" for a patient that physically walked in to register.
      // v3: name casing normalisation.
      version: 4,
      partialize: (state) => ({
        patients: state.patients,
        nextCode: state.nextCode,
      }),
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as {
          patients?: Patient[];
          nextCode?: number;
        };
        if (state?.patients) {
          state.patients = state.patients.map((p) => ({
            ...p,
            firstName: toTitleCase((p.firstName ?? "").trim()),
            middleName: p.middleName?.trim()
              ? toTitleCase(p.middleName.trim())
              : undefined,
            lastName: toTitleCase((p.lastName ?? "").trim()),
          }));

          if (fromVersion < 4) {
            state.patients = state.patients.map((p) => ({
              ...p,
              lastVisit: p.lastVisit ?? p.createdAt ?? SEED_STAMP.at,
            }));
          }
        }
        return state;
      },
    },
  ),
);

export function getPatientFullName(p: Patient): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}
