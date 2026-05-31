import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import { MAX_LONG_TEXT_LEN, MAX_NAME_LEN } from "@/server/limits";

export const runtime = "nodejs";

/**
 * PATCH /api/patients/[id]
 *
 * Update a patient the current lab knows about. The patient doc is
 * global (one per phone, shared across labs that have seen them) —
 * any field we set here is visible to every lab linked to the patient.
 * That matches source's design: lab-captured demographic data is a
 * shared profile, not a per-lab snapshot.
 *
 * Scope safety: a lab can only PATCH a patient it's actually linked to.
 * We check `linked_labs.includes(session.lab_id)` before writing.
 */
const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const PatchPatientSchema = z.object({
  firstName: z.preprocess(blankToUndefined, z.string().min(1).max(MAX_NAME_LEN).optional()),
  middleName: z.preprocess(blankToUndefined, z.string().max(MAX_NAME_LEN).optional()),
  lastName: z.preprocess(blankToUndefined, z.string().min(1).max(MAX_NAME_LEN).optional()),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  dateOfBirth: z.preprocess(blankToUndefined, z.string().max(20).optional()),
  age: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(150).optional(),
  ),
  phone: z.preprocess(blankToUndefined, z.string().min(4).max(20).optional()),
  email: z.preprocess(
    blankToUndefined,
    z.string().email().max(MAX_LONG_TEXT_LEN).optional(),
  ),
  address: z.preprocess(blankToUndefined, z.string().max(500).optional()),
  heightCm: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive().max(300).optional(),
  ),
  weightKg: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive().max(700).optional(),
  ),
});

function genderToSource(g: "Male" | "Female" | "Other"): string {
  if (g === "Male") return "male";
  if (g === "Female") return "female";
  return "unspecified";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: z.infer<typeof PatchPatientSchema>;
  try {
    body = PatchPatientSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  // The patients UI uses the short id (`shortId`) when the doc was
  // seeded with a `patient-NNNN` prefix; otherwise it's the raw uid.
  // Try the raw id first, fall back to the seed convention.
  let ref = db.collection("users").doc(id);
  let snap = await ref.get();
  if (!snap.exists) {
    ref = db.collection("users").doc(`patient-${id.padStart(4, "0")}`);
    snap = await ref.get();
  }
  if (!snap.exists) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const linkedLabs = (snap.data()?.linked_labs as string[] | undefined) ?? [];
  if (!linkedLabs.includes(session.lab_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build the merged display_name + Firestore field updates.
  const update: Record<string, unknown> = {};
  if (body.firstName || body.middleName || body.lastName) {
    const current = snap.data() ?? {};
    const next = {
      firstName: body.firstName ?? current.firstName ?? "",
      middleName: body.middleName ?? current.middleName ?? "",
      lastName: body.lastName ?? current.lastName ?? "",
    };
    const display = [next.firstName, next.middleName, next.lastName]
      .filter(Boolean)
      .join(" ");
    if (display) update.display_name = display;
  }
  if (body.gender) update.gender = genderToSource(body.gender);
  if (body.dateOfBirth) update.dob = body.dateOfBirth;
  if (body.age !== undefined) update.age = body.age;
  if (body.phone) update.phone_number = body.phone.replace(/\s/g, "");
  if (body.email !== undefined) update.email = body.email;
  if (body.address !== undefined) update.address = body.address;
  if (body.heightCm !== undefined) update.heightCm = body.heightCm;
  if (body.weightKg !== undefined) update.weightKg = body.weightKg;
  update.updated_at = FieldValue.serverTimestamp();

  try {
    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/patients/[id] PATCH] failed:", err);
    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 },
    );
  }
}
