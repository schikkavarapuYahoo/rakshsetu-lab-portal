import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import { resolveOrCreatePatient } from "@/server/patients/resolver";
import type { AuditStamp, Gender, Patient } from "@/lib/stores/patients";
import { toTitleCase } from "@/lib/utils";
import { MAX_LONG_TEXT_LEN, MAX_NAME_LEN } from "@/server/limits";

/** Map UI gender enum → source-schema lowercase form. */
function genderToSource(g: "MALE" | "FEMALE" | "OTHER"): string {
  if (g === "MALE") return "male";
  if (g === "FEMALE") return "female";
  return "unspecified";
}

/**
 * Normalise raw phone input to the canonical "+91…" form used by
 * `resolveOrCreatePatient`. Returns null if the digits don't add up to
 * something plausibly Indian (the only market we serve today).
 */
function normalizeIndianPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.length >= 11 ? digits : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

export const runtime = "nodejs";
// Per-lab data, changes with every new patient — don't cache.
export const dynamic = "force-dynamic";

/** First patient code per lab. Same starting number as the UI generator. */
const PATIENT_CODE_START = 10000;

/**
 * GET /api/patients — list every patient linked to the current lab.
 *
 * The source schema stores patients as `users/{uid}` docs with a
 * `linked_labs` array marking which labs they've visited. We query
 * that, scoped to the session's lab_id, and translate each doc into
 * the zustand `Patient` shape the UI expects.
 *
 * Two-store adapter — we'll collapse the shapes once the patients
 * store reads directly from Firestore. Until then, this route does
 * the structural mapping so the UI doesn't need to know about
 * `display_name` / `phone_number` / `placeholder`.
 */
// ── POST /api/patients ─────────────────────────────────────────────

/** Form-friendly empty-string → undefined coercion for optional fields. */
const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const CreatePatientSchema = z.object({
  firstName: z.string().min(1).max(MAX_NAME_LEN).trim(),
  middleName: z.preprocess(blankToUndefined, z.string().max(MAX_NAME_LEN).trim().optional()),
  lastName: z.string().min(1).max(MAX_NAME_LEN).trim(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.preprocess(blankToUndefined, z.string().max(20).optional()),
  age: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(150).optional()),
  phone: z.string().min(4).max(20).trim(),
  email: z.preprocess(
    blankToUndefined,
    z.string().email().max(MAX_LONG_TEXT_LEN).optional(),
  ),
  address: z.preprocess(blankToUndefined, z.string().max(500).optional()),
  heightCm: z.preprocess(blankToUndefined, z.coerce.number().positive().max(300).optional()),
  weightKg: z.preprocess(blankToUndefined, z.coerce.number().positive().max(700).optional()),
});

/**
 * POST /api/patients — register a new patient (or attach this lab to an
 * existing one identified by phone) and return the canonical Patient
 * row the UI will cache.
 *
 * The work is split:
 *   1. `resolveOrCreatePatient` finds-or-creates the `users/{uid}` doc
 *      keyed by phone. Idempotent across labs — calling it twice for
 *      the same phone yields the same uid.
 *   2. Any lab-captured fields (gender, age, vitals, address, etc.)
 *      not already on the doc get merged onto the user.
 *   3. A monotonically-increasing patient code is allocated from the
 *      lab's counter inside a Firestore transaction so two clients
 *      registering at the same instant can't collide on `P10042`.
 *      The code is stored on the user doc under `lab_patient_codes.{labId}`
 *      so the same global patient can have a different sequence at
 *      every lab they've visited.
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof CreatePatientSchema>;
  try {
    body = CreatePatientSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json(
      { error: "Invalid input", issues },
      { status: 400 },
    );
  }

  const phone = normalizeIndianPhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Invalid phone number" },
      { status: 400 },
    );
  }

  const displayName = [body.firstName, body.middleName, body.lastName]
    .filter(Boolean)
    .map((s) => toTitleCase(s!.trim()))
    .join(" ");

  const db = adminDb();

  try {
    // Step 1: find-or-create the global users/{uid} doc keyed by phone.
    const resolved = await resolveOrCreatePatient(
      {
        phone,
        name: displayName,
        gender: genderToSource(body.gender),
        age: body.age ?? null,
        dob: body.dateOfBirth ?? null,
      },
      session.lab_id,
    );

    // Step 2: merge any extra lab-captured fields the resolver didn't set.
    const labCapturedFields: Record<string, unknown> = {
      display_name: displayName,
      gender: genderToSource(body.gender),
    };
    if (body.age !== undefined) labCapturedFields.age = body.age;
    if (body.dateOfBirth) labCapturedFields.dob = body.dateOfBirth;
    if (body.email) labCapturedFields.email = body.email;
    if (body.address) labCapturedFields.address = body.address;
    if (body.heightCm) labCapturedFields.heightCm = body.heightCm;
    if (body.weightKg) labCapturedFields.weightKg = body.weightKg;

    // Step 3: allocate patient code under this lab's counter, atomically.
    // Stored at users/{uid}.lab_patient_codes[labId] so the same global
    // patient gets different per-lab codes (Lab A's P10042 vs Lab B's P10007).
    const labRef = db.collection("labs").doc(session.lab_id);
    const userRef = resolved.ref;
    const patientCode = await db.runTransaction(async (tx) => {
      const [labDoc, userDoc] = await Promise.all([
        tx.get(labRef),
        tx.get(userRef),
      ]);
      const existingCode = (userDoc.data()?.lab_patient_codes as
        | Record<string, string>
        | undefined)?.[session.lab_id];
      if (existingCode) {
        // This patient has visited this lab before — reuse their code.
        tx.update(userRef, labCapturedFields);
        return existingCode;
      }
      const currentCounter =
        (labDoc.data()?.patient_code_counter as number | undefined) ??
        PATIENT_CODE_START;
      const nextCounter = currentCounter + 1;
      const code = `P${nextCounter}`;
      tx.update(labRef, { patient_code_counter: nextCounter });
      tx.update(userRef, {
        ...labCapturedFields,
        [`lab_patient_codes.${session.lab_id}`]: code,
        last_visit_at: FieldValue.serverTimestamp(),
      });
      return code;
    });

    // Step 4: read back the merged doc so the response reflects ground truth.
    const fresh = await userRef.get();
    const patient = userDocToPatient(userRef.id, fresh.data() ?? {}, session.lab_id);
    if (!patient) {
      return NextResponse.json(
        { error: "Patient created but could not be loaded back" },
        { status: 500 },
      );
    }

    return NextResponse.json({ patient: { ...patient, patientCode } }, { status: 201 });
  } catch (err) {
    console.error("[api/patients POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to register patient" },
      { status: 500 },
    );
  }
}

// ── GET /api/patients ──────────────────────────────────────────────

export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb()
      .collection("users")
      .where("linked_labs", "array-contains", session.lab_id)
      .get();

    const patients: Patient[] = snap.docs
      .map((d) => userDocToPatient(d.id, d.data(), session!.lab_id))
      .filter((p): p is Patient => p !== null);

    return NextResponse.json({ patients });
  } catch (err) {
    console.error("[api/patients] failed:", err);
    return NextResponse.json(
      { error: "Failed to load patients" },
      { status: 500 },
    );
  }
}

const SEED_STAMP: AuditStamp = {
  userId: "u-system",
  userName: "System",
  at: "2026-04-01T09:00:00.000Z",
};

/**
 * Translate a source-schema `users/{uid}` doc into the zustand `Patient`
 * shape. Returns null when the doc is missing fields we need (e.g. a
 * placeholder created from an OTP signup with no name yet).
 */
function userDocToPatient(
  uid: string,
  data: FirebaseFirestore.DocumentData,
  labId: string,
): Patient | null {
  const displayName = (data.display_name as string | undefined) ?? "";
  const phone = (data.phone_number as string | undefined) ?? "";
  if (!displayName.trim() || !phone.trim()) return null;

  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

  const createdAt = toIso(data.created_at) ?? SEED_STAMP.at;

  // The zustand `Report` seed uses short numeric patient IDs ("1"..."8").
  // Our `users/{uid}` seed encodes that same id as `patient-0001`. Strip
  // the prefix so the local report → patient join continues to resolve.
  // Once reports also read from Firestore, both sides will share the uid
  // directly and this transform goes away.
  const shortId = uid.replace(/^patient-0*/, "") || uid;

  // Prefer the lab-allocated code (`lab_patient_codes.{labId}`) when
  // present — that's the monotonic per-lab code created by POST. Fall
  // back to the uid-derived code for legacy seed docs without one.
  const labCodes = data.lab_patient_codes as Record<string, string> | undefined;
  const patientCode = labCodes?.[labId] ?? `P${shortId.padStart(5, "0")}`;

  return {
    id: shortId,
    patientCode,
    firstName,
    lastName,
    gender: normalizeGender(data.gender),
    age: typeof data.age === "number" ? data.age : 0,
    dateOfBirth: typeof data.dob === "string" ? data.dob : undefined,
    phone,
    email: typeof data.email === "string" ? data.email : undefined,
    address: typeof data.address === "string" ? data.address : undefined,
    lastVisit: undefined, // Phase-2: derive from latest lab_report.created_at
    heightCm: typeof data.heightCm === "number" ? data.heightCm : undefined,
    weightKg: typeof data.weightKg === "number" ? data.weightKg : undefined,
    reportCount: 0, // Phase-2: count from lab_reports
    createdAt,
    createdBy: SEED_STAMP,
    updatedAt: createdAt,
    updatedBy: SEED_STAMP,
  };
}

function normalizeGender(raw: unknown): Gender {
  if (raw === "male" || raw === "Male" || raw === "MALE") return "Male";
  if (raw === "female" || raw === "Female" || raw === "FEMALE") return "Female";
  return "Other";
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof (value as { toDate?: () => Date })?.toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}
