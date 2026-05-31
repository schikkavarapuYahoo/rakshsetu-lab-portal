import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { requireAdminSession } from '@/server/auth/session';
import {
  assertPaise,
  MIN_PRICE_PER_REPORT_PAISE,
  MAX_PRICE_PER_REPORT_PAISE,
} from '@/lib/paise';

export const runtime = 'nodejs';

/**
 * POST /api/admin/billing/set-price
 *
 * Change a lab's per-report price. Writes:
 *   - labs/{lab_id}.per_report_paise = new_price_paise
 *   - lab_pricing_history/{auto_id} with old/new/reason/who/when
 *
 * Atomic: both writes happen in a single transaction. If the lab
 * doc update fails, the history entry doesn't get written either.
 *
 * Sanity bounds (Section 3 of brief):
 *   - Minimum ₹1  (100 paise)
 *   - Maximum ₹50 (5000 paise)
 *
 * Override outside these bounds requires direct Firestore edit.
 * That is intentional friction — a lab being charged ₹0.50 or ₹500
 * per report is almost certainly a fat-finger or a malicious admin
 * action; force it through a manual gate.
 *
 * Brief deviation note: existing field is `per_report_paise`, brief
 * called for `price_per_report_paise`. We kept the existing name to
 * avoid a 6-site rename. Documented in Round 7 Turn 1 notes.
 *
 * Body:
 *   {
 *     lab_id: string,
 *     new_price_paise: number,                      // 100 ≤ p ≤ 5000
 *     reason: string                                // required, audit
 *   }
 */
const SetPriceSchema = z.object({
  lab_id: z.string().min(1).max(64),
  new_price_paise: z
    .number()
    .int()
    .min(MIN_PRICE_PER_REPORT_PAISE, `Price must be at least ₹1`)
    .max(MAX_PRICE_PER_REPORT_PAISE, `Price cannot exceed ₹50`),
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

  let body: z.infer<typeof SetPriceSchema>;
  try {
    body = SetPriceSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    assertPaise(body.new_price_paise);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad price' },
      { status: 400 }
    );
  }

  const db = adminDb();
  const labRef = db.collection('labs').doc(body.lab_id);
  const historyRef = db.collection('lab_pricing_history').doc();

  let oldPricePaise = 0;
  try {
    await db.runTransaction(async (tx) => {
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) {
        throw new Error('LAB_NOT_FOUND');
      }
      const lab = labDoc.data() as { per_report_paise?: number };
      oldPricePaise =
        typeof lab.per_report_paise === 'number' ? lab.per_report_paise : 0;

      // No-op early exit if price is unchanged. We don't write a
      // history entry for "I changed it from ₹6 to ₹6" — that's
      // audit log noise. Caller gets a 200 with same_price: true.
      if (oldPricePaise === body.new_price_paise) {
        return;
      }

      tx.update(labRef, {
        per_report_paise: body.new_price_paise,
        // No last_credit_event_at update — pricing changes don't
        // touch the balance, only future debits.
      });

      tx.set(historyRef, {
        lab_id: body.lab_id,
        old_price_paise: oldPricePaise,
        new_price_paise: body.new_price_paise,
        effective_at: FieldValue.serverTimestamp(),
        changed_by_uid: session.staff_id,
        changed_by_email: session.email,
        changed_by_name: session.display_name,
        reason: body.reason,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'LAB_NOT_FOUND') {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    console.error('[admin/billing/set-price] tx failed:', e);
    return NextResponse.json(
      { error: 'Could not update price. Try again.' },
      { status: 500 }
    );
  }

  if (oldPricePaise === body.new_price_paise) {
    return NextResponse.json({
      ok: true,
      same_price: true,
      lab_id: body.lab_id,
      price_paise: body.new_price_paise,
    });
  }

  // Best-effort audit log
  try {
    await db.collection('staff_audit_logs').add({
      action: 'billing_price_change',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id: body.lab_id,
      old_price_paise: oldPricePaise,
      new_price_paise: body.new_price_paise,
      reason: body.reason,
      pricing_history_id: historyRef.id,
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[admin/billing/set-price] audit log write failed:', e);
  }

  return NextResponse.json({
    ok: true,
    lab_id: body.lab_id,
    old_price_paise: oldPricePaise,
    new_price_paise: body.new_price_paise,
    pricing_history_id: historyRef.id,
  });
}
