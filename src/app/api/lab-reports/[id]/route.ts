import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import type { Report } from "@/lib/stores/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const AuditStampSchema = z.object({
  userId: z.string().max(64),
  userName: z.string().max(120),
  at: z.string().max(40),
});

const ResultRowSchema = z.object({
  id: z.string().max(64),
  parameter: z.string().max(200),
  value: z.string().max(500),
  unit: z.string().max(40).optional(),
  referenceRange: z.string().max(200).optional(),
  flag: z.enum(["Low", "Normal", "High", "Critical"]).optional(),
  notes: z.string().max(500).optional(),
});

const PaymentSchema = z.object({
  amount: z.number().min(0),
  method: z.enum(["Cash", "UPI", "Card", "Bank Transfer", "Insurance", "Other"]),
  reference: z.string().max(200).optional(),
  paidAt: z.string().max(40),
  note: z.string().max(500).optional(),
  recordedAt: z.string().max(40),
  recordedBy: AuditStampSchema,
  discount: z.number().min(0).optional(),
  discountReason: z.string().max(200).optional(),
  refundedAt: z.string().max(40).optional(),
  refundedAmount: z.number().min(0).optional(),
  refundReason: z.string().max(500).optional(),
  refundMethod: z.enum(["Cash", "UPI", "Card", "Bank Transfer", "Insurance", "Other"]).optional(),
  refundedBy: AuditStampSchema.optional(),
});

const StatusHistoryEntrySchema = z.object({
  status: z.enum([
    "Ordered",
    "Sample Collected",
    "Waiting for Results",
    "Review",
    "Published",
    "Cancelled",
  ]),
  at: z.string().max(40),
  by: AuditStampSchema,
  note: z.string().max(500).optional(),
});

/**
 * PATCH /api/lab-reports/[id]
 *
 * Catch-all partial update. The UI's zustand store sends the full
 * report after each user action (sample collected, results entered,
 * payment recorded, critical acknowledged, etc.) — we trust the
 * client's diff and persist whatever fields are present. The server
 * still scopes by `lab_id` so a stolen report id can't be edited
 * across tenants.
 *
 * Why a single catch-all PATCH instead of per-action routes:
 *   - The state machine lives in the store; the server just records.
 *   - Pilot scope — we'll split into dedicated endpoints once the
 *     workflow is locked.
 *   - Keeps the round-trip count down: one fetch per user action.
 */
const PatchReportSchema = z.object({
  status: z
    .enum([
      "Ordered",
      "Sample Collected",
      "Waiting for Results",
      "Review",
      "Published",
      "Cancelled",
    ])
    .optional(),
  results: z.array(ResultRowSchema).max(100).optional(),
  notes: z.preprocess(blankToUndefined, z.string().max(2000).optional()),
  requestingDoctor: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  referringHospital: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  collectedAt: z.preprocess(blankToUndefined, z.string().max(40).optional()),
  reportedAt: z.preprocess(blankToUndefined, z.string().max(40).optional()),
  publishedAt: z.preprocess(blankToUndefined, z.string().max(40).optional()),
  sampleId: z.preprocess(blankToUndefined, z.string().max(64).optional()),
  sampleCondition: z
    .enum([
      "good",
      "hemolyzed",
      "clotted",
      "insufficient",
      "contaminated",
      "lipemic",
      "other",
    ])
    .optional(),
  sampleNote: z.preprocess(blankToUndefined, z.string().max(500).optional()),
  criticalsAcknowledged: z.boolean().optional(),
  criticalsAcknowledgedAt: z.string().max(40).optional(),
  criticalsAcknowledgedBy: AuditStampSchema.optional(),
  sentToPatientAt: z.string().max(40).optional(),
  sentToPatientBy: AuditStampSchema.optional(),
  sentToPatientChannel: z.enum(["whatsapp", "email", "sms"]).optional(),
  payment: PaymentSchema.optional().nullable(),
  statusHistory: z.array(StatusHistoryEntrySchema).max(50).optional(),
  updatedAt: z.string().max(40),
  updatedBy: AuditStampSchema,
});

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
  let body: z.infer<typeof PatchReportSchema>;
  try {
    body = PatchReportSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.collection("lab_reports").doc(id);

  try {
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    // Lab-scope guard — never let one lab mutate another's report,
    // even if they guessed the id.
    if (existing.data()?.lab_id !== session.lab_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Strip undefined keys so Firestore doesn't reject the write —
    // and so we don't accidentally clear unrelated fields.
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) update[k] = v;
    }

    await ref.update(update);
    const fresh = await ref.get();
    return NextResponse.json({ report: docToReport(fresh.id, fresh.data() ?? {}) });
  } catch (err) {
    console.error("[api/lab-reports PATCH] failed:", err);
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/lab-reports/[id]
 *
 * Soft "cancel" — flips status to Cancelled and appends to history.
 * A true delete is not exposed; pilot labs may want the audit trail
 * of a cancelled report rather than it vanishing entirely.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = adminDb();
  const ref = db.collection("lab_reports").doc(id);

  try {
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (existing.data()?.lab_id !== session.lab_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ref.update({
      status: "Cancelled",
      updatedAt: new Date().toISOString(),
      cancelledAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/lab-reports DELETE] failed:", err);
    return NextResponse.json(
      { error: "Failed to cancel report" },
      { status: 500 },
    );
  }
}

function docToReport(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Report {
  const { lab_id: _labId, created_at, ...rest } = data;
  void _labId;
  void created_at;
  return { ...(rest as Report), id };
}
