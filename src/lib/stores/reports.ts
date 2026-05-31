"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  MASTER_TEST_LIBRARY,
  type MasterTest,
} from "@/config/master-tests";
import { getCurrentUserSnapshot } from "@/lib/stores/auth";
import {
  usePatientsStore,
  type AuditStamp,
} from "@/lib/stores/patients";

// ────────────────────────────────────────────────────────────────────────────
//  STATUS MODEL
// ────────────────────────────────────────────────────────────────────────────
//  5-step main track:
//    Ordered → Sample Collected → Waiting for Results → Review → Published
//  New reports start at "Ordered" — the patient agreed to the price but
//  the technician hasn't taken the sample yet. Moving to "Sample
//  Collected" is an explicit action ("Collect sample" button) so the
//  status doesn't lie about the physical state of the sample.
//  Cancelled is a side state, reachable from any other state.

export type ReportStatus =
  | "Ordered"
  | "Sample Collected"
  | "Waiting for Results"
  | "Review"
  | "Published"
  | "Cancelled";

export const REPORT_STATUSES: ReportStatus[] = [
  "Ordered",
  "Sample Collected",
  "Waiting for Results",
  "Review",
  "Published",
  "Cancelled",
];

/** Ordered list of main-track steps used by the progress stepper. */
export const WORKFLOW_STEPS: ReportStatus[] = [
  "Ordered",
  "Sample Collected",
  "Waiting for Results",
  "Review",
  "Published",
];

/** Forward transition map. `Published` and `Cancelled` are terminal. */
const NEXT_STATUS: Partial<Record<ReportStatus, ReportStatus>> = {
  Ordered: "Sample Collected",
  "Sample Collected": "Waiting for Results",
  "Waiting for Results": "Review",
  Review: "Published",
};

// ────────────────────────────────────────────────────────────────────────────
//  TYPES
// ────────────────────────────────────────────────────────────────────────────

export type PaymentMethod =
  | "Cash"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Insurance"
  | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Insurance",
  "Other",
];

export interface Payment {
  /** What the patient actually paid, after discount. */
  amount: number;
  method: PaymentMethod;
  /** UPI txn ID, card last 4, bank ref, insurance claim number, etc. */
  reference?: string;
  /** Date the patient actually paid (ISO date-only). */
  paidAt: string;
  note?: string;
  /** Audit: who/when the payment was recorded in the system. */
  recordedAt: string;
  recordedBy: AuditStamp;
  /**
   * Optional discount taken off the catalog / quoted price. Display-only —
   * `amount` is already net of this. Stored so the receipt can show the
   * original subtotal and the discount line.
   */
  discount?: number;
  discountReason?: string;
  /**
   * Refund tracking. When a payment is refunded (cancelled report,
   * sample-issue rework, patient dispute), the original `amount` stays
   * put and we mark these fields. Collection math subtracts the refund
   * on the day it happened so the daily cash position stays honest.
   */
  refundedAt?: string;
  refundedAmount?: number;
  refundReason?: string;
  refundMethod?: PaymentMethod;
  refundedBy?: AuditStamp;
}

export interface RefundPaymentInput {
  /** Optional — defaults to the full amount paid. */
  amount?: number;
  method?: PaymentMethod;
  reason?: string;
  /** Defaults to today (ISO date-only). */
  refundedAt?: string;
}

export type ResultFlag = "Low" | "Normal" | "High" | "Critical";

export interface ResultRow {
  id: string;
  parameter: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: ResultFlag;
  notes?: string;
}

export interface StatusHistoryEntry {
  status: ReportStatus;
  at: string;
  by: AuditStamp;
  note?: string;
}

/**
 * Patient state captured at check-in for a single visit. Unlike the
 * patient's stored vitals (height / weight on `Patient`), these are
 * visit-level — they can be different at every visit (fasting today vs
 * not, BP higher than usual, etc). Snapshotted on each Report created
 * from the visit so the technician sees them when entering results and
 * the doctor sees them on the PDF.
 */
export type FastingStatus = "none" | "lt4h" | "4to8h" | "8plus";
export type PregnancyStatus = "yes" | "no" | "unknown";

/**
 * Physical state of the collected sample. `good` is the happy path; the
 * other values are reasons a sample may need to be redrawn or noted on
 * the report. Wider categories than CLSI's full taxonomy because small
 * labs rarely distinguish e.g. "moderately hemolyzed" vs "grossly
 * hemolyzed" in their workflow.
 */
export type SampleCondition =
  | "good"
  | "hemolyzed"
  | "clotted"
  | "insufficient"
  | "contaminated"
  | "lipemic"
  | "other";

export const SAMPLE_CONDITIONS: SampleCondition[] = [
  "good",
  "hemolyzed",
  "clotted",
  "insufficient",
  "contaminated",
  "lipemic",
  "other",
];

export const SAMPLE_CONDITION_LABEL: Record<SampleCondition, string> = {
  good: "Good",
  hemolyzed: "Hemolyzed",
  clotted: "Clotted",
  insufficient: "Insufficient volume",
  contaminated: "Contaminated",
  lipemic: "Lipemic",
  other: "Other",
};

export interface CheckInVitals {
  /** Systolic blood pressure in mmHg. */
  bpSystolic?: number;
  /** Diastolic blood pressure in mmHg. */
  bpDiastolic?: number;
  /** Temperature in °F (Indian-lab default). */
  temperatureF?: number;
  /** Heart rate in beats per minute. */
  pulseBpm?: number;
  /** How long the patient has fasted before this visit. */
  fastingStatus?: FastingStatus;
  /** Free-form chief complaint / reason for the visit. */
  symptoms?: string;
  /** Pregnancy status — only meaningful for reproductive-age female patients. */
  isPregnant?: PregnancyStatus;
  /** Last menstrual period date (ISO date) — relevant to hormone test interpretation. */
  lmpDate?: string;
}

export interface Report {
  id: string;
  reportCode: string;
  patientId: string;
  /**
   * Groups reports created together in one patient visit. A patient walking in
   * with a doctor's slip for CBC + Lipid + Thyroid produces three Report rows
   * sharing the same `visitId`. Each report still has its own status,
   * critical-acknowledgement, and payment — but billing/delivery code can roll
   * them up by visit. When billing/Visit-entity work lands in Phase 2, this
   * field is the seam to promote.
   */
  visitId: string;
  testName: string;
  testCode?: string;
  status: ReportStatus;
  requestingDoctor?: string;
  /**
   * Clinic / hospital the referring doctor practises at. Optional but
   * almost always present on Indian lab reports — the doctor expects
   * their practice name alongside their personal name on the printout
   * so referrals can be tracked back to the source.
   */
  referringHospital?: string;
  collectedAt?: string;
  reportedAt?: string;
  publishedAt?: string;
  results: ResultRow[];
  notes?: string;
  statusHistory: StatusHistoryEntry[];

  /** True if a technician has acknowledged all Critical-flagged results. */
  criticalsAcknowledged?: boolean;
  criticalsAcknowledgedAt?: string;
  criticalsAcknowledgedBy?: AuditStamp;

  /** When the published report was delivered to the patient (WhatsApp/email/etc.). */
  sentToPatientAt?: string;
  sentToPatientBy?: AuditStamp;
  /** Channel used for delivery — placeholder, no real API integration yet. */
  sentToPatientChannel?: "whatsapp" | "email" | "sms";

  /** Single payment record for this report. Undefined → unpaid. */
  payment?: Payment;

  /**
   * Human-readable identifier the technician writes on the physical
   * sample tube / container at collection. Derived from the report code
   * by default (R10028 → "S20260028") so the link to the
   * report stays obvious without a barcode lookup. Free-form so labs
   * with their own numbering system can override.
   */
  sampleId?: string;
  /** Physical state of the sample. Unset = not yet collected. */
  sampleCondition?: SampleCondition;
  /** Optional free-text note captured at collection (e.g. "difficult draw"). */
  sampleNote?: string;

  /**
   * Per-report TAT override in minutes, anchored to the Sample Collected
   * timestamp. When set, the countdown chip and the overdue notifier use
   * this instead of the catalog test's `turnaroundMinutes`. Lets a
   * technician say "give this one 90 minutes — analyzer is backed up"
   * without editing the lab-wide catalog. Unset = fall back to catalog.
   */
  tatMinutes?: number;

  /**
   * Snapshot of the patient's check-in state for this visit. Same
   * snapshot is duplicated across every report in the visit (cheap copy;
   * eliminates the need for a separate Visit entity for now). When the
   * Visit entity lands in Phase 2, this lifts to the visit row.
   */
  checkIn?: CheckInVitals;

  createdAt: string;
  createdBy: AuditStamp;
  updatedAt: string;
  updatedBy: AuditStamp;
}

export interface NewReportInput {
  patientId: string;
  /** Optional. If omitted, a fresh visitId is generated. */
  visitId?: string;
  testName: string;
  testCode?: string;
  /**
   * Defaults to "Ordered" — new reports enter the workflow at step 0
   * (patient agreed to price, sample not yet drawn). The technician
   * moves to "Sample Collected" via `collectSample()` when the sample
   * is physically taken.
   */
  status?: ReportStatus;
  requestingDoctor?: string;
  referringHospital?: string;
  collectedAt?: string;
  reportedAt?: string;
  results?: Omit<ResultRow, "id">[];
  notes?: string;
  /** Optional check-in vitals snapshot. Persisted on the created report. */
  checkIn?: CheckInVitals;
}

export type UpdateReportInput = Partial<
  Omit<
    Report,
    | "id"
    | "reportCode"
    | "status"
    | "statusHistory"
    | "createdAt"
    | "createdBy"
    | "updatedAt"
    | "updatedBy"
    | "publishedAt"
    | "criticalsAcknowledged"
    | "criticalsAcknowledgedAt"
    | "criticalsAcknowledgedBy"
    | "sentToPatientAt"
    | "sentToPatientBy"
    | "sentToPatientChannel"
    | "payment"
  >
>;

export interface NewPaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  /** Defaults to today (ISO date-only) if omitted. */
  paidAt?: string;
  note?: string;
  /** Discount applied off the catalog/quoted price. */
  discount?: number;
  discountReason?: string;
}

/** Thrown when a status transition is not allowed. */
export class InvalidTransitionError extends Error {
  constructor(
    public from: ReportStatus,
    public to: ReportStatus,
    message?: string,
  ) {
    super(message ?? `Cannot move report from "${from}" to "${to}".`);
    this.name = "InvalidTransitionError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────────────

/** Index of `status` in the main 4-step track, or -1 if Cancelled. */
export function getStepIndex(status: ReportStatus): number {
  return WORKFLOW_STEPS.indexOf(status);
}

/** True if any result row is flagged Critical. */
export function hasCriticalResults(report: Report): boolean {
  return report.results.some((r) => r.flag === "Critical");
}

/**
 * Returns null if the report can be published, otherwise a reason string.
 * Reasons: not in Review, no results entered, or unacknowledged criticals.
 */
export function reasonCannotPublish(report: Report): string | null {
  if (report.status !== "Review") {
    return `Report must be in Review (currently ${report.status})`;
  }
  if (report.results.length === 0) {
    return "Cannot publish a report with no result rows";
  }
  if (hasCriticalResults(report) && !report.criticalsAcknowledged) {
    return "Critical results must be acknowledged before publish";
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
//  SEED DATA
// ────────────────────────────────────────────────────────────────────────────

const SEED_STAMP_BASE: AuditStamp = {
  userId: "u-seed",
  userName: "Seed Data",
  at: "2026-04-01T09:00:00.000Z",
};

function seedStamp(offsetMinutes: number): AuditStamp {
  const at = new Date(
    Date.parse(SEED_STAMP_BASE.at) + offsetMinutes * 60 * 1000,
  ).toISOString();
  return { ...SEED_STAMP_BASE, at };
}

/** Build a plausible history for a seeded report given its current status. */
function seedHistoryFor(status: ReportStatus): StatusHistoryEntry[] {
  if (status === "Cancelled") {
    return [
      { status: "Sample Collected", at: seedStamp(0).at, by: seedStamp(0) },
      {
        status: "Cancelled",
        at: seedStamp(60).at,
        by: seedStamp(60),
        note: "Seeded cancellation",
      },
    ];
  }
  const stepIndex = WORKFLOW_STEPS.indexOf(status);
  if (stepIndex < 0) return [];
  const offsets = [0, 30, 120, 240];
  return WORKFLOW_STEPS.slice(0, stepIndex + 1).map((s, i) => ({
    status: s,
    at: seedStamp(offsets[i] ?? i * 60).at,
    by: seedStamp(offsets[i] ?? i * 60),
  }));
}

function makeResults(
  template: MasterTest,
  values: (string | { value: string; flag?: ResultFlag })[],
): ResultRow[] {
  return template.parameters.map((p, idx) => {
    const v = values[idx];
    const value = typeof v === "string" ? v : (v?.value ?? "");
    const flag = typeof v === "string" ? undefined : v?.flag;
    return {
      id: `seed-${template.code}-${idx}`,
      parameter: p.parameter,
      value,
      unit: p.unit,
      referenceRange: p.referenceRange,
      flag,
    };
  });
}

const t = (code: string): MasterTest =>
  MASTER_TEST_LIBRARY.find((x) => x.code === code)!;

type SeedSpec = Omit<
  Report,
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
  | "statusHistory"
  | "publishedAt"
  // visitId is derived from (patientId + collectedAt) at build time so reports
  // collected on the same day for the same patient share a visit.
  | "visitId"
>;

const seedVisitIdByKey = new Map<string, string>();
function seedVisitId(patientId: string, collectedAt: string | undefined): string {
  const key = `${patientId}|${collectedAt ?? "no-date"}`;
  let v = seedVisitIdByKey.get(key);
  if (!v) {
    v = `v-seed-${String(seedVisitIdByKey.size + 1).padStart(3, "0")}`;
    seedVisitIdByKey.set(key, v);
  }
  return v;
}

const seedReportsRaw: SeedSpec[] = [
  {
    id: "r-1",
    reportCode: "R10001",
    patientId: "1",
    testName: "Complete Blood Count",
    testCode: "CBC",
    status: "Published",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-05-15",
    reportedAt: "2026-05-15",
    results: makeResults(t("CBC"), ["14.2", "5.1", "7.8", "245", "44"]),
  },
  {
    id: "r-2",
    reportCode: "R10002",
    patientId: "1",
    testName: "Lipid Panel",
    testCode: "LIPID",
    status: "Review",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-05-14",
    reportedAt: "2026-05-14",
    results: makeResults(t("LIPID"), [
      { value: "215", flag: "High" },
      "48",
      { value: "138", flag: "High" },
      "142",
    ]),
  },
  {
    id: "r-3",
    reportCode: "R10003",
    patientId: "2",
    testName: "HbA1c",
    testCode: "HBA1C",
    status: "Published",
    requestingDoctor: "Dr. Pillai",
    collectedAt: "2026-05-14",
    reportedAt: "2026-05-14",
    results: makeResults(t("HBA1C"), ["5.4", "108"]),
  },
  {
    id: "r-4",
    reportCode: "R10004",
    patientId: "2",
    testName: "Thyroid Panel",
    testCode: "TSH-T3-T4",
    status: "Published",
    requestingDoctor: "Dr. Pillai",
    collectedAt: "2026-05-12",
    reportedAt: "2026-05-13",
    results: makeResults(t("TSH-T3-T4"), ["2.1", "3.0", "1.2"]),
  },
  {
    id: "r-5",
    reportCode: "R10005",
    patientId: "3",
    testName: "Liver Function Test",
    testCode: "LFT",
    status: "Published",
    requestingDoctor: "Dr. Rao",
    collectedAt: "2026-05-12",
    reportedAt: "2026-05-12",
    results: makeResults(t("LFT"), [
      { value: "52", flag: "High" },
      { value: "61", flag: "High" },
      "0.9",
      "98",
    ]),
  },
  {
    id: "r-6",
    reportCode: "R10006",
    patientId: "3",
    testName: "Kidney Function Test",
    testCode: "KFT",
    status: "Review",
    requestingDoctor: "Dr. Rao",
    collectedAt: "2026-05-11",
    reportedAt: "2026-05-11",
    results: makeResults(t("KFT"), ["1.1", "30", "5.8"]),
  },
  {
    id: "r-7",
    reportCode: "R10007",
    patientId: "4",
    testName: "HbA1c",
    testCode: "HBA1C",
    status: "Published",
    requestingDoctor: "Dr. Pillai",
    collectedAt: "2026-05-10",
    reportedAt: "2026-05-10",
    results: makeResults(t("HBA1C"), [
      { value: "6.8", flag: "High" },
      { value: "148", flag: "High" },
    ]),
  },
  {
    id: "r-8",
    reportCode: "R10008",
    patientId: "4",
    testName: "Vitamin D",
    testCode: "VIT-D",
    status: "Review",
    requestingDoctor: "Dr. Pillai",
    collectedAt: "2026-05-09",
    reportedAt: "2026-05-09",
    results: makeResults(t("VIT-D"), [{ value: "18", flag: "Low" }]),
  },
  {
    id: "r-9",
    reportCode: "R10009",
    patientId: "5",
    testName: "Complete Blood Count",
    testCode: "CBC",
    status: "Published",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-05-08",
    reportedAt: "2026-05-08",
    results: makeResults(t("CBC"), [
      { value: "11.8", flag: "Low" },
      "4.4",
      "8.1",
      "210",
      "38",
    ]),
  },
  {
    id: "r-10",
    reportCode: "R10010",
    patientId: "5",
    testName: "ESR",
    testCode: "ESR",
    status: "Published",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-05-08",
    reportedAt: "2026-05-08",
    results: makeResults(t("ESR"), ["12"]),
  },
  {
    id: "r-11",
    reportCode: "R10011",
    patientId: "6",
    testName: "Thyroid Panel",
    testCode: "TSH-T3-T4",
    status: "Review",
    requestingDoctor: "Dr. Rao",
    collectedAt: "2026-05-05",
    reportedAt: "2026-05-05",
    results: makeResults(t("TSH-T3-T4"), [
      { value: "6.4", flag: "Critical" },
      "2.4",
      "0.9",
    ]),
  },
  {
    id: "r-12",
    reportCode: "R10012",
    patientId: "7",
    testName: "Lipid Panel",
    testCode: "LIPID",
    status: "Review",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-04-28",
    reportedAt: "2026-04-28",
    results: makeResults(t("LIPID"), ["176", "52", "92", "115"]),
  },
  {
    id: "r-13",
    reportCode: "R10013",
    patientId: "3",
    testName: "Urine Routine",
    testCode: "URINE-R",
    status: "Waiting for Results",
    requestingDoctor: "Dr. Rao",
    collectedAt: "2026-05-16",
    results: [],
  },
  {
    id: "r-14",
    reportCode: "R10014",
    patientId: "1",
    testName: "Vitamin B12",
    testCode: "VIT-B12",
    status: "Sample Collected",
    requestingDoctor: "Dr. Mehta",
    collectedAt: "2026-05-16",
    results: [],
  },
  {
    id: "r-15",
    reportCode: "R10015",
    patientId: "6",
    testName: "Complete Blood Count",
    testCode: "CBC",
    status: "Sample Collected",
    requestingDoctor: "Dr. Rao",
    collectedAt: "2026-05-17",
    results: [],
  },
];

/** Plausible Indian-lab pricing per test code, used only for seed payments. */
const SEED_PRICES: Record<string, number> = {
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
};

/** Deterministic pick from a small list, seeded by the report id. */
function pickFor<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length]!;
}

export const seedReports: Report[] = seedReportsRaw.map((r) => {
  const history = seedHistoryFor(r.status);
  const publishedEntry = history.find((h) => h.status === "Published");
  // `reportedAt` should only carry a value once the report is actually
  // Published. Earlier seeds had it set on in-flight reports, which made the
  // list table show a "Reported" date for rows still at Review.
  const reportedAt = r.status === "Published" ? r.reportedAt : undefined;

  // Seed a plausible payment on Published reports so the billing UI has
  // realistic data without being uniformly perfect.
  let payment: Payment | undefined;
  if (r.status === "Published" && r.testCode) {
    const amount = SEED_PRICES[r.testCode] ?? 500;
    const method = pickFor<PaymentMethod>(r.id, [
      "Cash",
      "UPI",
      "UPI",
      "Card",
      "Bank Transfer",
      "Insurance",
    ]);
    const paidAt = r.reportedAt ?? r.collectedAt ?? "2026-04-01";
    payment = {
      amount,
      method,
      reference:
        method === "UPI"
          ? `UPI-${r.id.toUpperCase()}`
          : method === "Card"
            ? "**** 4242"
            : undefined,
      paidAt,
      recordedAt: publishedEntry?.at ?? SEED_STAMP_BASE.at,
      recordedBy: SEED_STAMP_BASE,
    };
  }

  return {
    ...r,
    visitId: seedVisitId(r.patientId, r.collectedAt),
    reportedAt,
    payment,
    statusHistory: history,
    publishedAt: publishedEntry?.at,
    createdAt: SEED_STAMP_BASE.at,
    createdBy: SEED_STAMP_BASE,
    updatedAt:
      history[history.length - 1]?.at ?? SEED_STAMP_BASE.at,
    updatedBy: SEED_STAMP_BASE,
  };
});

// ────────────────────────────────────────────────────────────────────────────
//  STORE
// ────────────────────────────────────────────────────────────────────────────

function currentStamp(): AuditStamp {
  const user = getCurrentUserSnapshot();
  return { userId: user.id, userName: user.name, at: new Date().toISOString() };
}

// Note: report-code allocation moved to the server-side transaction
// in `/api/lab-reports` (see `REPORT_CODE_START` there). The previous
// client-side `nextReportCode()` was removed because two devices
// generating codes locally could collide on the same accession number.

interface TransitionOpts {
  note?: string;
}

/** Options for the Ordered → Sample Collected transition. */
export interface CollectSampleOpts extends TransitionOpts {
  sampleId?: string;
  sampleCondition?: SampleCondition;
  sampleNote?: string;
  /** Per-report TAT override (minutes). Overrides catalog TAT. */
  tatMinutes?: number;
}

interface SendToPatientOpts {
  channel: "whatsapp" | "email" | "sms";
}

interface ReportsState {
  reports: Report[];
  addReport: (input: NewReportInput) => Promise<Report>;
  /**
   * Create N reports under a single shared visitId. Used by the new-report
   * flow when the receptionist selects multiple tests for one patient visit.
   */
  addReports: (inputs: NewReportInput[]) => Promise<Report[]>;
  updateReport: (id: string, changes: UpdateReportInput) => Report;
  deleteReport: (id: string) => void;
  getById: (id: string) => Report | undefined;
  reportsByPatient: (patientId: string) => Report[];
  reportsByVisit: (visitId: string) => Report[];

  // Transition actions
  collectSample: (id: string, opts?: CollectSampleOpts) => Report;
  startTesting: (id: string, opts?: TransitionOpts) => Report;
  sendForReview: (id: string, opts?: TransitionOpts) => Report;
  /**
   * Reverse-arrow transition: Review → Waiting for Results. Use when the
   * reviewer (or the same tech catching their own mistake) needs to fix
   * a value before publishing. Both the original move-to-Review and this
   * move-back land in the audit trail so the round-trip is visible.
   */
  reopenForCorrection: (id: string, opts?: TransitionOpts) => Report;
  /**
   * Amend a previously-published report. Moves status back to "Waiting
   * for Results" so the value can be corrected, and stamps the audit
   * trail with `Amendment: <reason>`. Requires a reason — without it
   * NABL's "every amendment must be justified" rule isn't satisfied.
   * On the next publish, the print template renders an AMENDED stamp
   * and the version count is inferred from the number of Published
   * entries in `statusHistory`.
   */
  amendPublished: (id: string, reason: string) => Report;
  publish: (id: string, opts?: TransitionOpts) => Report;
  cancel: (id: string, opts?: TransitionOpts) => Report;

  acknowledgeCriticals: (id: string) => Report;
  sendToPatient: (id: string, opts: SendToPatientOpts) => Report;

  /**
   * Drop the per-report TAT override so the countdown falls back to the
   * catalog's `turnaroundMinutes`. Sends a sentinel `null` to the server
   * (translated to FieldValue.delete()) — distinct from `updateReport`,
   * which strips undefineds and can't actually clear a persisted field.
   */
  clearTatMinutes: (id: string) => Report;

  // Payment
  recordPayment: (id: string, input: NewPaymentInput) => Report;
  refundPayment: (id: string, input?: RefundPaymentInput) => Report;
  clearPayment: (id: string) => Report;

  reset: () => void;
  /**
   * Replace the in-memory list with the canonical list from Firestore.
   * Runs at app boot via `StoreHydrationDriver`. If the server returns
   * an empty list, the local cache is preserved (the local state may
   * be ahead of Firestore between an action firing and its background
   * PATCH committing).
   */
  hydrateFromAPI: () => Promise<void>;
}

// ── REMOTE PERSISTENCE ────────────────────────────────────────────────
// All mutating actions also flush to /api/lab-reports so the work
// survives a refresh. addReport is the single sync point (server
// allocates the reportCode); everything else is fire-and-forget — on
// reload, `hydrateFromAPI` reconciles. If you need stricter guarantees,
// switch to await + handle the error toast.

async function createReportRemote(payload: Omit<Report, "id" | "reportCode">): Promise<Report> {
  const res = await fetch("/api/lab-reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Could not create report (${res.status})`);
  }
  const { report } = (await res.json()) as { report: Report };
  return report;
}

function persistReportRemote(report: Report): void {
  const { id, reportCode: _r, ...patch } = report;
  void _r;
  void fetch(`/api/lab-reports/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).then((res) => {
    if (!res.ok) {
      console.warn(`[reports] PATCH ${id} failed: ${res.status}`);
    }
  }).catch((err) => {
    console.warn(`[reports] PATCH ${id} threw:`, err);
  });
}

/**
 * Variant of `persistReportRemote` that passes `null` as a sentinel to the
 * server's PATCH route (translated to FieldValue.delete()), so a persisted
 * field actually goes away. The plain version stringifies undefined to
 * nothing, which can't clear.
 */
function persistReportFieldClearRemote(
  report: Report,
  nullableFields: string[],
): void {
  const { id, reportCode: _r, ...patch } = report;
  void _r;
  const body: Record<string, unknown> = { ...patch };
  for (const k of nullableFields) body[k] = null;
  void fetch(`/api/lab-reports/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) {
      console.warn(`[reports] PATCH (clear) ${id} failed: ${res.status}`);
    }
  }).catch((err) => {
    console.warn(`[reports] PATCH (clear) ${id} threw:`, err);
  });
}

function deleteReportRemote(id: string): void {
  void fetch(`/api/lab-reports/${id}`, { method: "DELETE" }).catch((err) => {
    console.warn(`[reports] DELETE ${id} threw:`, err);
  });
}

export const useReportsStore = create<ReportsState>()(
  persist(
    (set, get) => {
      function applyTransition(
        id: string,
        next: ReportStatus,
        opts?: TransitionOpts,
      ): Report {
        const existing = get().reports.find((r) => r.id === id);
        if (!existing) throw new Error(`Report not found: ${id}`);

        // Validate transition (Cancelled is always allowed)
        if (next !== "Cancelled") {
          const allowed = NEXT_STATUS[existing.status];
          if (allowed !== next) {
            throw new InvalidTransitionError(existing.status, next);
          }
        }
        if (existing.status === "Cancelled") {
          throw new InvalidTransitionError(
            existing.status,
            next,
            "Cancelled reports cannot be reopened",
          );
        }

        // Block publish when blocking conditions exist
        if (next === "Published") {
          const reason = reasonCannotPublish({
            ...existing,
            status: "Review",
          });
          if (reason) throw new Error(reason);
        }

        const stamp = currentStamp();
        const historyEntry: StatusHistoryEntry = {
          status: next,
          at: stamp.at,
          by: stamp,
          note: opts?.note,
        };

        const updated: Report = {
          ...existing,
          status: next,
          statusHistory: [...existing.statusHistory, historyEntry],
          publishedAt: next === "Published" ? stamp.at : existing.publishedAt,
          updatedAt: stamp.at,
          updatedBy: stamp,
        };

        set((state) => ({
          reports: state.reports.map((r) => (r.id === id ? updated : r)),
        }));
        persistReportRemote(updated);
        return updated;
      }

      return {
        // See patients.ts for the same rationale — empty initial state
        // so a fresh pilot lab doesn't see 15 ghost demo reports while
        // hydration is in flight.
        reports: [],

        addReport: async (input) => {
          const stamp = currentStamp();
          const status: ReportStatus = input.status ?? "Ordered";
          const results: ResultRow[] = (input.results ?? []).map((r) => ({
            id: crypto.randomUUID(),
            parameter: r.parameter,
            value: r.value,
            unit: r.unit,
            referenceRange: r.referenceRange,
            flag: r.flag,
            notes: r.notes,
          }));
          // Server allocates `id` and `reportCode` atomically from the
          // lab counter — round-trip first, then update local cache
          // from the response. (vs the patterns above where local mutation
          // happens first and persistence is fire-and-forget.)
          const created = await createReportRemote({
            patientId: input.patientId,
            visitId: input.visitId ?? crypto.randomUUID(),
            testName: input.testName.trim(),
            testCode: input.testCode?.trim() || undefined,
            status,
            requestingDoctor: input.requestingDoctor?.trim() || undefined,
            collectedAt: input.collectedAt || undefined,
            reportedAt: input.reportedAt || undefined,
            results,
            notes: input.notes?.trim() || undefined,
            checkIn: input.checkIn,
            statusHistory: [{ status, at: stamp.at, by: stamp }],
            createdAt: stamp.at,
            createdBy: stamp,
            updatedAt: stamp.at,
            updatedBy: stamp,
          });
          set((state) => ({ reports: [created, ...state.reports] }));
          // Stamp the patient so `lastVisit` is never NULL after a real
          // visit. The patients page derives a display-time map from
          // reports too, but persisting on the patient record matches
          // what the DB column will look like.
          usePatientsStore.getState().setLastVisit(input.patientId, stamp.at);
          return created;
        },

        addReports: async (inputs) => {
          if (inputs.length === 0) return [];
          // One visitId per call. Caller can override by providing visitId on
          // each input, but the typical multi-test flow lets the store decide.
          const sharedVisitId = inputs[0]?.visitId ?? crypto.randomUUID();
          const created: Report[] = [];
          for (const input of inputs) {
            const report = await get().addReport({
              ...input,
              visitId: input.visitId ?? sharedVisitId,
            });
            created.push(report);
          }
          return created;
        },

        updateReport: (id, changes) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          const stamp = currentStamp();
          const updated: Report = {
            ...existing,
            ...changes,
            id: existing.id,
            reportCode: existing.reportCode,
            status: existing.status,
            statusHistory: existing.statusHistory,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            publishedAt: existing.publishedAt,
            criticalsAcknowledged: existing.criticalsAcknowledged,
            criticalsAcknowledgedAt: existing.criticalsAcknowledgedAt,
            criticalsAcknowledgedBy: existing.criticalsAcknowledgedBy,
            sentToPatientAt: existing.sentToPatientAt,
            sentToPatientBy: existing.sentToPatientBy,
            sentToPatientChannel: existing.sentToPatientChannel,
            payment: existing.payment,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        deleteReport: (id) => {
          set((state) => ({
            reports: state.reports.filter((r) => r.id !== id),
          }));
          deleteReportRemote(id);
        },

        getById: (id) => get().reports.find((r) => r.id === id),

        reportsByPatient: (patientId) =>
          get().reports.filter((r) => r.patientId === patientId),

        reportsByVisit: (visitId) =>
          get().reports.filter((r) => r.visitId === visitId),

        collectSample: (id, opts) => {
          const updated = applyTransition(id, "Sample Collected", opts);
          // Stamp the physical-sample metadata so the technician has a
          // tube label, a condition flag, and a free-form note for any
          // collection quirks. Default sampleId derives from the report
          // code so the tube is obviously linked to the report.
          if (
            !opts?.sampleId &&
            !opts?.sampleCondition &&
            !opts?.sampleNote &&
            typeof opts?.tatMinutes !== "number"
          ) {
            return updated;
          }
          const sampleId =
            opts?.sampleId?.trim() ||
            updated.reportCode.replace(/^R/, "S");
          const stamp = currentStamp();
          const tatMinutes =
            typeof opts?.tatMinutes === "number" &&
            Number.isFinite(opts.tatMinutes) &&
            opts.tatMinutes > 0
              ? Math.round(opts.tatMinutes)
              : updated.tatMinutes;
          const next: Report = {
            ...updated,
            sampleId,
            sampleCondition: opts?.sampleCondition ?? updated.sampleCondition,
            sampleNote: opts?.sampleNote?.trim() || updated.sampleNote,
            tatMinutes,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? next : r)),
          }));
          persistReportRemote(next);
          return next;
        },

        startTesting: (id, opts) =>
          applyTransition(id, "Waiting for Results", opts),

        sendForReview: (id, opts) => {
          const existing = get().reports.find((r) => r.id === id);
          if (existing) {
            // Reject empty arrays AND arrays of only empty-value rows.
            // The latter is the realistic mistake: technician added a
            // row "Hemoglobin" but never typed a value, then hit Mark
            // Ready for Review. The UI guards this too; this is the
            // store-side belt for any programmatic caller.
            const hasAnyValue = existing.results.some(
              (r) => r.value.trim() !== "",
            );
            if (!hasAnyValue) {
              throw new Error(
                "Enter at least one result value before sending for review",
              );
            }
          }
          return applyTransition(id, "Review", opts);
        },

        amendPublished: (id, reason) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (existing.status !== "Published") {
            throw new Error(
              `Can only amend a Published report (currently ${existing.status})`,
            );
          }
          const trimmed = reason.trim();
          if (!trimmed) {
            throw new Error("Amendment reason is required");
          }
          // Bypasses applyTransition. The status moves Published →
          // Waiting for Results so the editor reopens; the audit entry
          // uses the `Amendment: <reason>` convention so the print
          // template (and any future amendment-only view) can pick it
          // up by parsing the note prefix.
          const stamp = currentStamp();
          const historyEntry: StatusHistoryEntry = {
            status: "Waiting for Results",
            at: stamp.at,
            by: stamp,
            note: `Amendment: ${trimmed}`,
          };
          const updated: Report = {
            ...existing,
            status: "Waiting for Results",
            statusHistory: [...existing.statusHistory, historyEntry],
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        reopenForCorrection: (id, opts) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (existing.status !== "Review") {
            throw new Error(
              `Can only reopen from Review (currently ${existing.status})`,
            );
          }
          // Bypasses applyTransition's NEXT_STATUS check — this is the
          // sole sanctioned reverse-arrow in the workflow.
          const stamp = currentStamp();
          const historyEntry: StatusHistoryEntry = {
            status: "Waiting for Results",
            at: stamp.at,
            by: stamp,
            note: opts?.note ?? "Reopened for correction",
          };
          const updated: Report = {
            ...existing,
            status: "Waiting for Results",
            statusHistory: [...existing.statusHistory, historyEntry],
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        publish: (id, opts) => applyTransition(id, "Published", opts),

        cancel: (id, opts) => applyTransition(id, "Cancelled", opts),

        clearTatMinutes: (id) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (typeof existing.tatMinutes !== "number") return existing;
          const stamp = currentStamp();
          const { tatMinutes: _t, ...rest } = existing;
          void _t;
          const updated: Report = {
            ...rest,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportFieldClearRemote(updated, ["tatMinutes"]);
          return updated;
        },

        acknowledgeCriticals: (id) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          const stamp = currentStamp();
          const updated: Report = {
            ...existing,
            criticalsAcknowledged: true,
            criticalsAcknowledgedAt: stamp.at,
            criticalsAcknowledgedBy: stamp,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        recordPayment: (id, input) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (!Number.isFinite(input.amount) || input.amount <= 0) {
            throw new Error("Payment amount must be greater than zero");
          }
          if (
            typeof input.discount === "number" &&
            (!Number.isFinite(input.discount) || input.discount < 0)
          ) {
            throw new Error("Discount must be zero or greater");
          }
          const stamp = currentStamp();
          const today = new Date().toISOString().slice(0, 10);
          const discount =
            typeof input.discount === "number" && input.discount > 0
              ? Math.round(input.discount * 100) / 100
              : undefined;
          const payment: Payment = {
            amount: Math.round(input.amount * 100) / 100,
            method: input.method,
            reference: input.reference?.trim() || undefined,
            paidAt: input.paidAt || today,
            note: input.note?.trim() || undefined,
            recordedAt: stamp.at,
            recordedBy: stamp,
            discount,
            discountReason: discount
              ? input.discountReason?.trim() || undefined
              : undefined,
          };
          const updated: Report = {
            ...existing,
            payment,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        refundPayment: (id, input) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (!existing.payment) {
            throw new Error("No payment to refund on this report");
          }
          if (existing.payment.refundedAt) {
            throw new Error("This payment has already been refunded");
          }
          const fullAmount = existing.payment.amount;
          const amount =
            typeof input?.amount === "number" && input.amount > 0
              ? Math.round(input.amount * 100) / 100
              : fullAmount;
          if (amount > fullAmount) {
            throw new Error(
              `Refund amount (₹${amount}) cannot exceed paid amount (₹${fullAmount})`,
            );
          }
          const stamp = currentStamp();
          const today = new Date().toISOString().slice(0, 10);
          const updated: Report = {
            ...existing,
            payment: {
              ...existing.payment,
              refundedAt: input?.refundedAt || today,
              refundedAmount: amount,
              refundReason: input?.reason?.trim() || undefined,
              refundMethod: input?.method ?? existing.payment.method,
              refundedBy: stamp,
            },
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        clearPayment: (id) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          const stamp = currentStamp();
          const updated: Report = {
            ...existing,
            payment: undefined,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        sendToPatient: (id, opts) => {
          const existing = get().reports.find((r) => r.id === id);
          if (!existing) throw new Error(`Report not found: ${id}`);
          if (existing.status !== "Published") {
            throw new Error("Only published reports can be sent to the patient");
          }
          const stamp = currentStamp();
          const updated: Report = {
            ...existing,
            sentToPatientAt: stamp.at,
            sentToPatientBy: stamp,
            sentToPatientChannel: opts.channel,
            updatedAt: stamp.at,
            updatedBy: stamp,
          };
          set((state) => ({
            reports: state.reports.map((r) => (r.id === id ? updated : r)),
          }));
          persistReportRemote(updated);
          return updated;
        },

        reset: () => set({ reports: [] }),

        hydrateFromAPI: async () => {
          const res = await fetch("/api/lab-reports", { cache: "no-store" });
          if (res.status === 401) return; // pre-login — driver will retry
          if (!res.ok) {
            throw new Error(`GET /api/lab-reports ${res.status}`);
          }
          const body = (await res.json()) as { reports?: Report[] };
          const reports = body.reports ?? [];
          // Empty server result mustn't clobber a populated local cache
          // — a fire-and-forget PATCH may still be in flight from a
          // recent action. Re-hydrate only when the server has data.
          if (reports.length === 0) return;
          set({ reports });
        },
      };
    },
    {
      name: "rakshsetu-reports",
      // v6: added required `visitId` to group reports created in one visit.
      //     Pre-existing reports get the seeded visitId if they match a seed
      //     row, otherwise a fresh per-report visitId (treated as a 1-test
      //     visit, since we have no way to recover the original grouping).
      // v5: re-run payment seeding migration (v4 shipped without it).
      // v4: added optional `payment` per report (amount + method).
      // v3: cleared `reportedAt` on non-Published seeds so the list table no
      // longer shows a Reported date for rows still in flight.
      version: 6,
      partialize: (state) => ({ reports: state.reports }),
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as { reports?: Partial<Report>[] };
        if (!state?.reports) return { reports: [] };

        // ≤v4 → v5: persisted reports have no `payment` field. For seeded
        // Published reports, re-attach the seeded payment so the billing UI
        // isn't empty on first load after upgrade. User-created reports stay
        // unpaid (no implicit payment invented for them).
        if (fromVersion < 5) {
          const seedById = new Map(seedReports.map((s) => [s.id, s]));
          state.reports = state.reports.map((r) => {
            const seedMatch = seedById.get(r.id ?? "");
            return {
              ...r,
              payment: r.payment ?? seedMatch?.payment,
            };
          });
        }

        // v2 → v3: clear stale reportedAt on non-Published reports.
        state.reports = state.reports.map((r) =>
          r.status === "Published" ? r : { ...r, reportedAt: undefined },
        );

        // ≤v5 → v6: backfill visitId. Match against seedReports first to
        // preserve the same-day-same-patient grouping for seeded rows; for
        // user-created rows generate a unique id (treated as a solo visit).
        if (fromVersion < 6) {
          const seedById = new Map(seedReports.map((s) => [s.id, s]));
          state.reports = state.reports.map((r) => ({
            ...r,
            visitId:
              r.visitId ??
              seedById.get(r.id ?? "")?.visitId ??
              crypto.randomUUID(),
          }));
        }

        return { reports: state.reports as Report[] };
      },
    },
  ),
);

// ────────────────────────────────────────────────────────────────────────────
//  STYLE TOKENS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Semantic variant for each report status — drives `StatusBadge` colour
 * choices across the app. Co-located with `STATUS_TONE` so the two mappings
 * stay aligned (if you change one, change the other).
 *
 *   Ordered               → brand    (terracotta — fresh order)
 *   Sample Collected      → info     (sky)
 *   Waiting for Results   → warning  (amber)
 *   Review                → accent   (violet)
 *   Published             → success  (emerald)
 *   Cancelled             → neutral  (gray)
 */
export const STATUS_VARIANT: Record<
  ReportStatus,
  "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "brand"
> = {
  Ordered: "brand",
  "Sample Collected": "info",
  "Waiting for Results": "warning",
  Review: "accent",
  Published: "success",
  Cancelled: "neutral",
};

export const STATUS_TONE: Record<
  ReportStatus,
  { bg: string; text: string; ring: string; dot: string }
> = {
  Ordered: {
    // Brand tint — signals "this is a fresh order, awaiting your action".
    bg: "bg-brand-50",
    text: "text-brand-700",
    ring: "ring-brand-200",
    dot: "bg-brand-500",
  },
  "Sample Collected": {
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
    dot: "bg-sky-500",
  },
  "Waiting for Results": {
    bg: "bg-amber-50",
    text: "text-amber-800",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  Review: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
    dot: "bg-violet-500",
  },
  Published: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
  },
  Cancelled: {
    bg: "bg-neutral-100",
    text: "text-neutral-500",
    ring: "ring-neutral-200",
    dot: "bg-neutral-400",
  },
};

export const FLAG_TONE: Record<ResultFlag, { bg: string; text: string }> = {
  Low: { bg: "bg-sky-50", text: "text-sky-700" },
  Normal: { bg: "bg-neutral-100", text: "text-neutral-600" },
  High: { bg: "bg-amber-50", text: "text-amber-800" },
  Critical: { bg: "bg-red-50", text: "text-red-700" },
};
