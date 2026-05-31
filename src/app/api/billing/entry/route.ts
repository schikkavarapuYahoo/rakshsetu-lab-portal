import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/entry
 *
 * Append a credit or debit entry to `labs/{labId}/credit_ledger` and
 * update `labs/{labId}.credit_balance_paise` in a single transaction
 * so the balance and the audit trail can never drift.
 *
 * Used by:
 *   - The billing store's `credit()` (top-ups, trial grants, refunds)
 *   - The billing store's `debit()` (per-report fee on publish)
 *
 * Demo mode: pilot top-ups carry `reason: "topup"` plus a
 * `metadata.razorpay_order_id` field starting with `DEMO`. When
 * Razorpay goes live the metadata switches to a real order id.
 *
 * The route does NOT enforce min/max amounts — those are policy
 * checks the client store handles before calling. The route does
 * enforce sign-of-amount per direction and refuses to take the
 * balance negative.
 */

const AuditStampSchema = z.object({
  userId: z.string().max(64),
  userName: z.string().max(120),
  at: z.string().max(40),
});

const PostEntrySchema = z.object({
  direction: z.enum(["credit", "debit"]),
  amountPaise: z.number().int().positive().max(100_000_000),
  reason: z.enum([
    "trial_grant",
    "topup",
    "report_submission",
    "compensation",
    "manual_adjustment",
  ]),
  metadata: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  by: AuditStampSchema,
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PostEntrySchema>;
  try {
    body = PostEntrySchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  const labRef = db.collection("labs").doc(session.lab_id);
  const entryRef = labRef.collection("credit_ledger").doc();
  const signedDelta =
    body.direction === "credit" ? body.amountPaise : -body.amountPaise;

  try {
    const result = await db.runTransaction(async (tx) => {
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) {
        throw new Error("LAB_NOT_FOUND");
      }
      const current = (labDoc.data()?.credit_balance_paise as number) ?? 0;
      const next = current + signedDelta;
      if (next < 0) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      tx.set(entryRef, {
        direction: body.direction,
        amountPaise: body.amountPaise,
        reason: body.reason,
        balanceAfterPaise: next,
        metadata: body.metadata ?? {},
        by: body.by,
        createdAt: body.by.at,
        created_at: FieldValue.serverTimestamp(),
      });
      tx.update(labRef, {
        credit_balance_paise: next,
        last_credit_event_at: FieldValue.serverTimestamp(),
      });
      return { id: entryRef.id, balanceAfterPaise: next };
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      balanceAfterPaise: result.balanceAfterPaise,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "LAB_NOT_FOUND") {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }
    if (message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 402 },
      );
    }
    console.error("[api/billing/entry] failed:", err);
    return NextResponse.json(
      { error: "Failed to record entry" },
      { status: 500 },
    );
  }
}
