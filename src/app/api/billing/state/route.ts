import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/state
 *
 * Returns the lab's current billing snapshot — balance, settings,
 * suspension flag, and the last 200 ledger entries newest-first.
 * Drives the /billing page and the low-balance banner.
 *
 * Stored under:
 *   labs/{labId}.credit_balance_paise
 *   labs/{labId}.price_per_report_paise (lab-set, falls back to default)
 *   labs/{labId}.low_balance_threshold_paise (lab-set, falls back to default)
 *   labs/{labId}.manually_suspended (boolean)
 *   labs/{labId}/credit_ledger/{entryId}  (subcollection, append-only)
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const labRef = db.collection("labs").doc(session.lab_id);

  try {
    const [labDoc, ledgerSnap] = await Promise.all([
      labRef.get(),
      labRef
        .collection("credit_ledger")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get(),
    ]);
    const lab = labDoc.data() ?? {};

    return NextResponse.json({
      balancePaise: (lab.credit_balance_paise as number) ?? 0,
      pricePerReportPaise: (lab.price_per_report_paise as number) ?? null,
      lowBalanceThresholdPaise:
        (lab.low_balance_threshold_paise as number) ?? null,
      manuallySuspended: (lab.manually_suspended as boolean) ?? false,
      ledger: ledgerSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    console.error("[api/billing/state] failed:", err);
    return NextResponse.json(
      { error: "Failed to load billing state" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/billing/state
 *
 * Bulk update of lab-level billing settings: price-per-report,
 * low-balance threshold, manual suspend flag. Single round-trip for
 * the Settings → Billing form. The credit/debit ledger entries go
 * through their own dedicated routes.
 */
import { z } from "zod";
import type { NextRequest } from "next/server";

const PatchSettingsSchema = z.object({
  pricePerReportPaise: z.number().int().min(0).max(5_000_000).optional(),
  lowBalanceThresholdPaise: z.number().int().min(0).max(50_000_000).optional(),
  manuallySuspended: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PatchSettingsSchema>;
  try {
    body = PatchSettingsSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.pricePerReportPaise !== undefined)
    update.price_per_report_paise = body.pricePerReportPaise;
  if (body.lowBalanceThresholdPaise !== undefined)
    update.low_balance_threshold_paise = body.lowBalanceThresholdPaise;
  if (body.manuallySuspended !== undefined)
    update.manually_suspended = body.manuallySuspended;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }
  update.updated_at = FieldValue.serverTimestamp();

  try {
    await adminDb().collection("labs").doc(session.lab_id).update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/billing/state POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to update billing settings" },
      { status: 500 },
    );
  }
}
