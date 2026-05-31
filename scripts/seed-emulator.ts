/**
 * Seed the local Firebase emulator with SOURCE-SCHEMA demo data.
 *
 * The source repo (and our 29 ported API routes) expect a multi-tenant
 * Firestore layout — labs/, staff/, users/ (patients), lab_reports/,
 * lab_report_batches/. This script provisions one demo lab, one admin
 * staff user, all our zustand-shipped seed patients (as `users` docs
 * with `placeholder: true`), and one `lab_reports` doc per
 * zustand-shipped seed report (grouped into batches by visitId).
 *
 * Run with:
 *   npm run emu:seed
 *
 * Login after seeding:
 *   POST /api/auth/login { lab_code: "RAKSHDEMO", pin: "1234" }
 *   POST /api/auth/staff-login { email: "admin@rakshsetu.com", password: "admin1234" }
 *
 * The script wipes the seeded collections before writing, so it stays
 * idempotent. Real user-created data in those same collections would
 * also be wiped — only run this against the emulator.
 */

import bcrypt from "bcryptjs";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";

import type { Patient } from "../src/lib/stores/patients";
import type { Report } from "../src/lib/stores/reports";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST is not set. Refusing to run — this script is\n" +
      "for the local emulator only. Use `npm run emu:seed` instead of\n" +
      "running tsx directly.",
  );
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT || "demo-rakshsetu";
if (getApps().length === 0) {
  initializeApp({ projectId });
}

// ── Demo identities ────────────────────────────────────────────────
const LAB_ID = "demo-lab-001";
const LAB_CODE = "RAKSHDEMO";
const LAB_PIN = "1234";
const LAB_NAME = "RakshSetu Demo Lab";

const ADMIN_ID = "admin-001";
const ADMIN_EMAIL = "admin@rakshsetu.com";
const ADMIN_PASSWORD = "admin1234";

// Test-code → STANDARD_FORMS form_id. Tests we don't have a form_id for
// (e.g. ESR, VIT-B12 with different naming) are skipped at seed time;
// the UI catalog refactor in Phase 2 will broaden coverage.
const TEST_CODE_TO_FORM_ID: Record<string, string> = {
  CBC: "cbc",
  LIPID: "lipid_profile",
  HBA1C: "hba1c",
  "TSH-T3-T4": "thyroid_full",
  LFT: "liver_function",
  KFT: "kidney_function",
  "URINE-R": "urine_routine",
  "VIT-D": "vitamin_d",
  "VIT-B12": "vitamin_b12",
};

// ── Helpers ────────────────────────────────────────────────────────
function fullName(p: Patient): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function genderToSource(g: Patient["gender"]): string {
  if (g === "Male") return "male";
  if (g === "Female") return "female";
  return "unspecified";
}

async function wipeCollection(db: Firestore, name: string): Promise<number> {
  const snap = await db.collection(name).get();
  if (snap.empty) return 0;
  const batches: FirebaseFirestore.WriteBatch[] = [];
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      batches.push(batch);
      batch = db.batch();
    }
  }
  batches.push(batch);
  for (const b of batches) await b.commit();
  return snap.size;
}

// ── Seeders ────────────────────────────────────────────────────────
async function seedLab(db: Firestore): Promise<void> {
  const pinHash = await bcrypt.hash(LAB_PIN, 10);
  // 30 days from now — keep the demo lab safely inside its billing window.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const periodStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  await db.collection("labs").doc(LAB_ID).set({
    lab_code: LAB_CODE,
    lab_name: LAB_NAME,
    lab_address: "Plot 24, Sector 7, Pune 411014",
    lab_phone: "+91 98765 11111",
    lab_email: "owner@rakshsetu-demo.in",
    lab_logo_url: "",
    lab_logo_path: "",
    authorized_signatory: "Dr. Siddu Chikkavarapu",
    signatory_role: "Pathologist",
    pin_hash: pinHash,
    status: "active",
    plan: "standard",
    subscription_plan: "standard",
    subscription_active: true,
    subscription_billing_cycle: "monthly",
    subscription_started_at: periodStart,
    subscription_expires_at: expiresAt,
    current_period_started_at: periodStart,
    current_period_report_count: 0,
    current_period_overage_count: 0,
    // Counters used by POST /api/patients and POST /api/reports to
    // hand out monotonic per-lab codes (P10001, R10001, …) inside a
    // Firestore transaction. Start at 10000 so the first record gets 10001.
    patient_code_counter: 10000,
    report_code_counter: 10000,
    created_at: FieldValue.serverTimestamp(),
    last_login_at: null,
    last_login_ip: null,
  });
  console.log(`  ✓ labs/${LAB_ID} (code=${LAB_CODE}, pin=${LAB_PIN})`);
}

async function seedAdminStaff(db: Firestore): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db.collection("staff").doc(ADMIN_ID).set({
    email: ADMIN_EMAIL,
    password_hash: passwordHash,
    display_name: "Demo Admin",
    role: "admin",
    territory: "",
    phone: "",
    status: "active",
    labs_owned_count: 1,
    created_at: FieldValue.serverTimestamp(),
    last_login_at: null,
  });
  console.log(`  ✓ staff/${ADMIN_ID} (email=${ADMIN_EMAIL}, pw=${ADMIN_PASSWORD})`);
}

async function seedPatientsAsUsers(
  db: Firestore,
  seedPatients: Patient[],
): Promise<Map<string, DocumentReference>> {
  // Map keyed by the zustand patient id (e.g. "1", "2") → users/{uid} ref.
  // The downstream report seeder uses this to set patient_user_ref.
  const refByZustandId = new Map<string, DocumentReference>();

  const batch = db.batch();
  for (const p of seedPatients) {
    const phone = normalizePhone(p.phone);
    // Deterministic doc id so re-seeding doesn't create dupes.
    const uid = `patient-${p.id.padStart(4, "0")}`;
    const ref = db.collection("users").doc(uid);
    refByZustandId.set(p.id, ref);

    batch.set(ref, {
      phone_number: phone,
      display_name: fullName(p),
      gender: genderToSource(p.gender),
      dob: p.dateOfBirth ?? null,
      age: p.age,
      placeholder: true,
      created_via: "lab",
      created_by_lab_id: LAB_ID,
      created_at: FieldValue.serverTimestamp(),
      linked_labs: [LAB_ID],
    });
  }
  await batch.commit();
  console.log(`  ✓ users: ${seedPatients.length} patient docs`);
  return refByZustandId;
}

async function seedReportsAndBatches(
  db: Firestore,
  seedReports: Report[],
  seedPatients: Patient[],
  patientRefs: Map<string, DocumentReference>,
): Promise<void> {
  // Group reports by visitId so each visit becomes one lab_report_batches doc.
  const byVisit = new Map<string, Report[]>();
  for (const r of seedReports) {
    const list = byVisit.get(r.visitId) ?? [];
    list.push(r);
    byVisit.set(r.visitId, list);
  }

  const patientById = new Map(seedPatients.map((p) => [p.id, p]));

  let reportCount = 0;
  let skipCount = 0;
  let batchCount = 0;

  for (const [visitId, reports] of byVisit) {
    const writeBatch = db.batch();
    const first = reports[0];
    const patient = patientById.get(first.patientId);
    if (!patient) {
      skipCount += reports.length;
      continue;
    }
    const patientRef = patientRefs.get(first.patientId);
    if (!patientRef) {
      skipCount += reports.length;
      continue;
    }

    // Filter out reports whose testCode we can't map to a form_id. The
    // /api/draft-batch/submit route validates form_id against
    // STANDARD_FORMS, so unmappable codes would crash any downstream
    // read that resolves the form definition.
    const mappable = reports.filter(
      (r) => r.testCode && TEST_CODE_TO_FORM_ID[r.testCode],
    );
    skipCount += reports.length - mappable.length;
    if (mappable.length === 0) continue;

    const testSummaries: Array<{
      form_id: string;
      form_name: string;
      report_id: string;
      max_severity: "normal" | "warning" | "critical";
      flagged_count: number;
      batch_status: "completed" | "partial";
    }> = [];

    mappable.forEach((r, idx) => {
      const formId = TEST_CODE_TO_FORM_ID[r.testCode!]!;
      // Source's max_severity vocabulary is normal | warning | critical.
      // Map our ResultFlag → that vocabulary.
      const hasCritical = r.results.some((row) => row.flag === "Critical");
      const hasWarn = r.results.some(
        (row) => row.flag === "Low" || row.flag === "High",
      );
      const maxSeverity: "normal" | "warning" | "critical" = hasCritical
        ? "critical"
        : hasWarn
          ? "warning"
          : "normal";
      const flaggedCount = r.results.filter(
        (row) => row.flag && row.flag !== "Normal",
      ).length;

      // Use the report's existing id so re-seeding is deterministic.
      const reportRef = db.collection("lab_reports").doc(r.id);
      writeBatch.set(reportRef, {
        // Identity
        lab_id: LAB_ID,
        lab_code: LAB_CODE,
        lab_name_at_time: LAB_NAME,
        lab_address_at_time: "Plot 24, Sector 7, Pune 411014",
        lab_phone_at_time: "+91 98765 11111",
        lab_email_at_time: "owner@rakshsetu-demo.in",
        lab_logo_url_at_time: "",
        authorized_signatory_at_time: "Dr. Siddu Chikkavarapu",
        signatory_role_at_time: "Pathologist",

        // Patient (denormalized snapshot + reference)
        patient_user_ref: patientRef,
        patient_name_at_time: fullName(patient),
        patient_phone_at_time: normalizePhone(patient.phone),
        patient_dob_at_time: patient.dateOfBirth ?? null,
        patient_gender_at_time: genderToSource(patient.gender),
        patient_age_at_time: patient.age,

        // Test (values left empty — Phase 2 maps ResultRow → form field ids)
        form_id: formId,
        form_name: r.testName,
        form_category: "biochemistry",
        values: {},
        flagged_fields: [],
        max_severity: maxSeverity,

        // Batch metadata
        batch_id: visitId,
        batch_test_count: mappable.length,
        batch_position: idx + 1,
        batch_status: "completed",

        // Workflow
        test_date: r.collectedAt ?? null,
        referring_doctor: r.requestingDoctor ?? "",
        sample_collected_at: r.collectedAt ?? "",
        notes: r.notes ?? "",
        status: r.status === "Published" ? "sent" : "draft",

        // Billing (zero for seed — real submissions would compute)
        billing_amount_paise: 0,
        billing_balance_after_paise: 0,
        billing_mode: "subscription",
        billing_usage_bucket: "normal",
        patient_price_paise: 0,

        created_at: FieldValue.serverTimestamp(),
      });

      testSummaries.push({
        form_id: formId,
        form_name: r.testName,
        report_id: r.id,
        max_severity: maxSeverity,
        flagged_count: flaggedCount,
        batch_status: "completed",
      });
      reportCount++;
    });

    // One lab_report_batches doc per visit.
    const batchRef = db.collection("lab_report_batches").doc(visitId);
    const worstSeverity = testSummaries.some((s) => s.max_severity === "critical")
      ? "critical"
      : testSummaries.some((s) => s.max_severity === "warning")
        ? "warning"
        : "normal";
    const flaggedTotal = testSummaries.reduce((a, s) => a + s.flagged_count, 0);

    writeBatch.set(batchRef, {
      batch_id: visitId,
      patient_user_ref: patientRef,
      patient_uid: patientRef.id,
      patient_name_at_time: fullName(patient),
      patient_phone_at_time: normalizePhone(patient.phone),
      lab_id: LAB_ID,
      lab_code: LAB_CODE,
      lab_name_at_time: LAB_NAME,
      test_count: testSummaries.length,
      test_categories: ["biochemistry"],
      test_summaries: testSummaries,
      max_severity_across_batch: worstSeverity,
      flagged_count: flaggedTotal,
      partial_count: 0,
      combined_pdf_storage_path: null,
      combined_pdf_status: "pending",
      combined_pdf_generated_at: null,
      notification_sent: false,
      notification_sent_at: null,
      test_date: first.collectedAt ?? null,
      created_at: FieldValue.serverTimestamp(),
    });
    batchCount++;

    await writeBatch.commit();
  }

  console.log(`  ✓ lab_reports: ${reportCount} docs`);
  console.log(`  ✓ lab_report_batches: ${batchCount} docs`);
  if (skipCount > 0) {
    console.log(`  ⚠ skipped ${skipCount} reports (no form_id mapping)`);
  }
}

// ── Main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(
    `Seeding emulator at ${process.env.FIRESTORE_EMULATOR_HOST} (project=${projectId})`,
  );

  const [{ seedPatients }, { seedReports }] = await Promise.all([
    import("../src/lib/stores/patients"),
    import("../src/lib/stores/reports"),
  ]);

  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  // Wipe collections we own. Leave the emulator's auth state alone.
  const targets = [
    "labs",
    "staff",
    "users",
    "lab_reports",
    "lab_report_batches",
    // legacy collections from the previous (zustand-shape) seed
    "patients",
    "reports",
    "lab_tests",
  ];
  console.log("Wiping previous seed…");
  for (const t of targets) {
    const n = await wipeCollection(db, t);
    if (n > 0) console.log(`  ${t}: deleted ${n}`);
  }

  console.log("Provisioning…");
  await seedLab(db);
  await seedAdminStaff(db);
  const patientRefs = await seedPatientsAsUsers(db, seedPatients);
  await seedReportsAndBatches(db, seedReports, seedPatients, patientRefs);

  console.log("\nDone.\n");
  console.log("Login with:");
  console.log(`  lab_code: ${LAB_CODE}    pin: ${LAB_PIN}`);
  console.log(`  admin:    ${ADMIN_EMAIL}    password: ${ADMIN_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
