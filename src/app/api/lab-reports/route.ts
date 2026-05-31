import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import type { Report } from "@/lib/stores/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First report code per lab. Matches the UI generator. */
const REPORT_CODE_START = 10000;

const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const AuditStampSchema = z.object({
  userId: z.string().max(64),
  userName: z.string().max(120),
  at: z.string().max(40),
});

const CreateReportSchema = z.object({
  patientId: z.string().min(1).max(64),
  visitId: z.string().max(64).optional(),
  testName: z.string().min(1).max(200),
  testCode: z.string().max(64).optional(),
  requestingDoctor: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  referringHospital: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  notes: z.preprocess(blankToUndefined, z.string().max(2000).optional()),
  // Initial result rows are pre-populated from the test's parameter list
  // so result entry has the right rows to fill in.
  results: z.array(
    z.object({
      id: z.string().max(64),
      parameter: z.string().max(200),
      value: z.string().max(500),
      unit: z.string().max(40).optional(),
      referenceRange: z.string().max(200).optional(),
      flag: z.enum(["Low", "Normal", "High", "Critical"]).optional(),
      notes: z.string().max(500).optional(),
    }),
  ).max(100),
  // Snapshot of the patient's check-in vitals for this visit.
  checkIn: z
    .object({
      bpSystolic: z.number().int().min(0).max(400).optional(),
      bpDiastolic: z.number().int().min(0).max(400).optional(),
      temperatureF: z.number().min(0).max(120).optional(),
      pulseBpm: z.number().int().min(0).max(400).optional(),
      fastingStatus: z.enum(["none", "lt4h", "4to8h", "8plus"]).optional(),
      symptoms: z.string().max(1000).optional(),
      isPregnant: z.enum(["yes", "no", "unknown"]).optional(),
      lmpDate: z.string().max(20).optional(),
    })
    .optional(),
  // Audit stamp comes from the client — `currentStamp()` in the store.
  // Once the auth store reads from JWT, the server will derive this
  // from the session directly and ignore the client value.
  createdBy: AuditStampSchema,
});

/**
 * POST /api/lab-reports — create a new report row in this lab's queue.
 *
 * Allocates the report code atomically from the lab's counter
 * (`labs/{labId}.report_code_counter`) so two devices submitting at the
 * same instant can't collide. Status defaults to "Ordered" — the
 * patient agreed to the price but no sample has been drawn yet.
 *
 * Body shape mirrors the zustand `Report` type 1:1, minus the fields
 * the server computes (id, reportCode, createdAt, statusHistory).
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof CreateReportSchema>;
  try {
    body = CreateReportSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  const labRef = db.collection("labs").doc(session.lab_id);
  const reportsCol = db.collection("lab_reports");
  const newReportRef = reportsCol.doc();
  const stamp = body.createdBy;

  try {
    const reportCode = await db.runTransaction(async (tx) => {
      const labDoc = await tx.get(labRef);
      const current =
        (labDoc.data()?.report_code_counter as number | undefined) ??
        REPORT_CODE_START;
      const next = current + 1;
      tx.update(labRef, { report_code_counter: next });

      const report: Report = {
        id: newReportRef.id,
        reportCode: `R${next}`,
        patientId: body.patientId,
        visitId: body.visitId ?? newReportRef.id,
        testName: body.testName,
        testCode: body.testCode,
        status: "Ordered",
        requestingDoctor: body.requestingDoctor,
        referringHospital: body.referringHospital,
        notes: body.notes,
        results: body.results,
        statusHistory: [
          {
            status: "Ordered",
            at: stamp.at,
            by: stamp,
          },
        ],
        checkIn: body.checkIn,
        createdAt: stamp.at,
        createdBy: stamp,
        updatedAt: stamp.at,
        updatedBy: stamp,
      };

      tx.set(newReportRef, {
        ...report,
        lab_id: session.lab_id,
        created_at: FieldValue.serverTimestamp(),
      });
      return `R${next}`;
    });

    // Read back the doc the way the GET endpoint does so the client
    // gets an identical shape to what hydration would return.
    const fresh = await newReportRef.get();
    return NextResponse.json(
      { report: docToReport(fresh.id, fresh.data() ?? {}) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/lab-reports POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/lab-reports — list every report for the current lab.
 *
 * Returns up to 500 reports newest-first. For pilot labs that's a
 * comfortable safety margin; if real volume crosses that, paginate.
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb()
      .collection("lab_reports")
      .where("lab_id", "==", session.lab_id)
      .orderBy("created_at", "desc")
      .limit(500)
      .get();

    const reports = snap.docs.map((d) => docToReport(d.id, d.data()));
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[api/lab-reports GET] failed:", err);
    return NextResponse.json(
      { error: "Failed to load reports" },
      { status: 500 },
    );
  }
}

/**
 * Strip the storage-only fields (`lab_id`, server-side `created_at`)
 * and return the zustand `Report` shape the UI expects. The persisted
 * fields are already a structural match; this is mostly a cast +
 * Timestamp coercion for the server timestamp.
 */
function docToReport(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Report {
  const { lab_id: _labId, created_at, ...rest } = data;
  void _labId;
  void created_at;
  return { ...(rest as Report), id };
}
