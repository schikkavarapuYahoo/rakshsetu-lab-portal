import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { requireAdminSession } from '@/server/auth/session';

export const runtime = 'nodejs';

/**
 * POST /api/admin/billing/suspend
 *
 * Set a lab's billing_status. Suspended labs cannot submit reports
 * (Section 4 of the brief — the debit transaction throws
 * LAB_SUSPENDED before any read of balance).
 *
 * Same endpoint handles BOTH suspend and reactivate via the
 * `action` field. Two endpoints would be more REST-pure but this
 * is one less route to test, one less rule, and the action enum
 * makes the intent explicit in the URL log:
 *
 *     POST /api/admin/billing/suspend  { action: "suspend",   ... }
 *     POST /api/admin/billing/suspend  { action: "reactivate", ... }
 *
 * Note: this endpoint does NOT write to credit_ledger. Suspension
 * is a status flag, not a credit movement — there's no debit or
 * credit happening. We do write to staff_audit_logs and to a new
 * billing_status_history collection so the change is auditable.
 *
 * Why not credit_ledger: putting status changes in the financial
 * ledger pollutes the reconciliation walk (which sums debits and
 * credits and expects balance_after to match). A status change
 * has zero amount; it would always be a no-op in the math but
 * would still need filtering. Cleaner to keep it separate.
 *
 * Body:
 *   {
 *     lab_id: string,
 *     action: 'suspend' | 'reactivate',
 *     reason: string                              // required, audit
 *   }
 */
const SuspendSchema = z.object({
  lab_id: z.string().min(1).max(64),
  action: z.enum(['suspend', 'reactivate']),
  reason: z
    .string()
    .min(3, 'Reason required for audit trail')
    .max(500, 'Reason too long'),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }

  let body: z.infer<typeof SuspendSchema>;
  try {
    body = SuspendSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const newStatus =
    body.action === 'suspend' ? 'suspended' : 'active';

  const db = adminDb();
  const labRef = db.collection('labs').doc(body.lab_id);
  const historyRef = db
    .collection('billing_status_history')
    .doc();

  let oldStatus = 'unknown';
  try {
    await db.runTransaction(async (tx) => {
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) {
        throw new Error('LAB_NOT_FOUND');
      }
      const lab = labDoc.data() as { billing_status?: string };
      oldStatus = lab.billing_status ?? 'active';

      // No-op when the requested action matches current state.
      // Caller gets a 200 with no_change: true; useful so the UI
      // can render an idempotent toggle without worrying about
      // duplicate clicks.
      if (oldStatus === newStatus) {
        return;
      }

      tx.update(labRef, {
        billing_status: newStatus,
        billing_status_changed_at: FieldValue.serverTimestamp(),
        billing_status_changed_by: session.staff_id,
      });

      tx.set(historyRef, {
        lab_id: body.lab_id,
        old_status: oldStatus,
        new_status: newStatus,
        action: body.action,
        reason: body.reason,
        changed_by_uid: session.staff_id,
        changed_by_email: session.email,
        changed_by_name: session.display_name,
        changed_at: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'LAB_NOT_FOUND') {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    console.error('[admin/billing/suspend] tx failed:', e);
    return NextResponse.json(
      { error: 'Could not update billing status. Try again.' },
      { status: 500 }
    );
  }

  if (oldStatus === newStatus) {
    return NextResponse.json({
      ok: true,
      no_change: true,
      lab_id: body.lab_id,
      status: newStatus,
    });
  }

  // Best-effort audit
  try {
    await db.collection('staff_audit_logs').add({
      action:
        body.action === 'suspend'
          ? 'billing_lab_suspend'
          : 'billing_lab_reactivate',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id: body.lab_id,
      old_status: oldStatus,
      new_status: newStatus,
      reason: body.reason,
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[admin/billing/suspend] audit log write failed:', e);
  }

  return NextResponse.json({
    ok: true,
    lab_id: body.lab_id,
    old_status: oldStatus,
    new_status: newStatus,
  });
}
