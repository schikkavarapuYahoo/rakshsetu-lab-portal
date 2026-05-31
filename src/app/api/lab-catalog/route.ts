import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import type { LabTest } from "@/lib/stores/lab-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-lab test catalog persistence.
 *
 * Storage: one snapshot doc per lab at `labs/{labId}/lab_catalog/snapshot`
 * holding the lab's current `tests: LabTest[]`. The catalog is small
 * (~50 entries × ~1KB each = well under Firestore's 1MB doc cap), so
 * a whole-array rewrite per change keeps the wiring simple and
 * avoids merge logic.
 *
 * Trade-off: last-write-wins on concurrent edits. Acceptable for pilot
 * scale — same-lab simultaneous catalog edits from two devices are
 * vanishingly rare. Promote to one-doc-per-test if that changes.
 */

// Parameter shape matches `MasterTestParameter` (and the lab catalog
// store's local copy) — single `parameter` name field, no separate
// code/name split. An earlier draft of this route validated against
// a different shape (`code` + `name`), which silently rejected every
// non-empty parameter list and left labs with `parameters: []` even
// for master-sourced tests — the catalog's hydration heal now puts
// the master parameters back, and this schema lets them persist.
const ParameterSchema = z.object({
  parameter: z.string().min(1).max(200),
  unit: z.string().max(40).optional(),
  referenceRange: z.string().max(200).optional(),
});

const AuditStampSchema = z.object({
  userId: z.string().max(64),
  userName: z.string().max(120),
  at: z.string().max(40),
});

const LabTestSchema = z.object({
  id: z.string().max(64),
  source: z.enum(["master", "custom"]),
  masterCode: z.string().max(64).optional(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  category: z.string().max(100),
  description: z.string().max(2000).optional(),
  parameters: z.array(ParameterSchema).max(100),
  isActive: z.boolean(),
  basePrice: z.number().min(0).max(500000).optional(),
  turnaroundMinutes: z.number().int().min(0).max(60 * 24 * 30),
  sampleType: z.string().max(100),
  tubeColor: z.string().max(100),
  patientPrep: z.string().max(2000),
  createdAt: z.string().max(40),
  createdBy: AuditStampSchema,
  updatedAt: z.string().max(40),
  updatedBy: AuditStampSchema,
});

const PutCatalogSchema = z.object({
  tests: z.array(LabTestSchema).max(500),
});

function snapshotRef(labId: string) {
  return adminDb()
    .collection("labs")
    .doc(labId)
    .collection("lab_catalog")
    .doc("snapshot");
}

/**
 * GET /api/lab-catalog — return this lab's persisted catalog snapshot,
 * or 204 No Content if no snapshot has been persisted yet (lets the
 * client know to fall back to its seeded default).
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await snapshotRef(session.lab_id).get();
    if (!snap.exists) {
      return NextResponse.json({ tests: [] }, { status: 200 });
    }
    const data = snap.data();
    return NextResponse.json({ tests: (data?.tests as LabTest[]) ?? [] });
  } catch (err) {
    console.error("[api/lab-catalog GET] failed:", err);
    return NextResponse.json(
      { error: "Failed to load catalog" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/lab-catalog — replace the lab's catalog snapshot with the
 * provided list. Whole-array semantics: send the full canonical list,
 * not a diff. Idempotent.
 */
export async function PUT(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PutCatalogSchema>;
  try {
    body = PutCatalogSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  try {
    await snapshotRef(session.lab_id).set({
      tests: body.tests,
      updated_at: FieldValue.serverTimestamp(),
      updated_by_lab_id: session.lab_id,
    });
    return NextResponse.json({ ok: true, count: body.tests.length });
  } catch (err) {
    console.error("[api/lab-catalog PUT] failed:", err);
    return NextResponse.json(
      { error: "Failed to save catalog" },
      { status: 500 },
    );
  }
}
