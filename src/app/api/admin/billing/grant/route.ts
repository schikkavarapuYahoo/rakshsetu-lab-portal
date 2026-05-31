import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { requireAdminSession } from '@/server/auth/session';
import { assertPaise, MAX_TOPUP_PAISE } from '@/lib/paise';

export const runtime = 'nodejs';

/**
 * POST /api/admin/billing/grant
 *
 * Admin-side credit grant. Used for:
 *   - trial_grant       → free credits to onboard a new pilot lab
 *   - compensation      → make-good after a service issue, refund a
 *                         debit that shouldn't have happened
 *   - manual_adjustment → catch-all for anything else (Section 14
 *                         test #9: "manually corrupt and watch recon
 *                         catch it" → also the path to FIX such corruption)
 *
 * Section 0.7 of the brief: "Audit trail is sacred." Every grant
 * must capture admin's UID, IP, and a human-readable note. Ledger
 * entry is the canonical record; the lab balance is a denormalized
 * cache that the daily reconciliation job verifies.
 *
 * Atomicity matters here for the same reason as the debit path
 * (Section 4): two simultaneous admin grants on the same lab could
 * both read the old balance, both add their amount to it, and the
 * second write clobbers the first. The transaction prevents this
 * even though admin grants are infrequent — defensive coding now
 * costs nothing; debugging a "where did ₹500 go?" later costs hours.
 *
 * Body:
 *   {
 *     lab_id: string,                                    // doc ID under /labs
 *     amount_paise: number,                              // positive integer paise
 *     reason: 'trial_grant' | 'compensation' | 'manual_adjustment',
 *     note: string                                       // required, audit
 *   }
 *
 * Response 200:
 *   {
 *     ok: true,
 *     lab_id, new_balance_paise, ledger_entry_id
 *   }
 */
const GrantSchema = z.object({
  lab_id: z.string().min(1).max(64),
  amount_paise: z
    .number()
    .int()
    .min(1, 'Amount must be at least 1 paisa')
    // Re-use top-up upper bound. Anything more than ₹1,00,000 in a
    // single grant should go through direct DB edit (intentional
    // friction — same logic as the brief's MAX_TOPUP).
    .max(MAX_TOPUP_PAISE, 'Amount exceeds maximum single-grant limit'),
  reason: z.enum(['trial_grant', 'compensation', 'manual_adjustment']),
  note: z
    .string()
    .min(3, 'Note required for audit trail')
    .max(500, 'Note too long'),
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

  let body: z.infer<typeof GrantSchema>;
  try {
    body = GrantSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Belt-and-suspenders: assert the integer paise contract here too.
  // Zod already validated this shape, but the assertion gives us
  // consistent error messaging across all billing endpoints.
  try {
    assertPaise(body.amount_paise);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad amount' },
      { status: 400 }
    );
  }

  const actorIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const db = adminDb();
  const labRef = db.collection('labs').doc(body.lab_id);
  const ledgerRef = db.collection('credit_ledger').doc();

  let newBalancePaise = 0;
  try {
    await db.runTransaction(async (tx) => {
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) {
        throw new Error('LAB_NOT_FOUND');
      }
      const lab = labDoc.data() as {
        credit_balance?: number;
        trial_credits_granted_paise?: number;
      };
      const currentBalance =
        typeof lab.credit_balance === 'number' ? lab.credit_balance : 0;
      newBalancePaise = currentBalance + body.amount_paise;

      const labUpdate: Record<string, unknown> = {
        credit_balance: newBalancePaise,
        last_credit_event_at: FieldValue.serverTimestamp(),
      };
      // Trial grants increment the cumulative trial-credits counter
      // so we can answer "how much have we given this lab for free?"
      // without walking the full ledger. trial_credits_granted_paise
      // is a denormalized cache like credit_balance; reconciliation
      // walks the ledger to verify both.
      if (body.reason === 'trial_grant') {
        const currentTrial =
          typeof lab.trial_credits_granted_paise === 'number'
            ? lab.trial_credits_granted_paise
            : 0;
        labUpdate.trial_credits_granted_paise =
          currentTrial + body.amount_paise;
      }
      tx.update(labRef, labUpdate);

      tx.set(ledgerRef, {
        lab_id: body.lab_id,
        direction: 'credit',
        amount_paise: body.amount_paise,
        reason: body.reason,
        balance_after_paise: newBalancePaise,
        // No linked_doc_path for admin grants — they don't reference
        // a payment or a report. We could link to staff_audit_logs,
        // but those don't exist as routable docs the way payments
        // and lab_reports do. Leave null and put context in metadata.
        linked_doc_path: null,
        actor_type: 'admin',
        actor_id: session.staff_id,
        actor_ip: actorIp,
        metadata: {
          admin_email: session.email,
          admin_name: session.display_name,
          note: body.note,
        },
        created_at: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'LAB_NOT_FOUND') {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    console.error('[admin/billing/grant] tx failed:', e);
    return NextResponse.json(
      { error: 'Could not grant credits. Try again.' },
      { status: 500 }
    );
  }

  // Best-effort audit log entry (separate from ledger; the ledger
  // is the financial record, this is the staff-action record).
  try {
    await db.collection('staff_audit_logs').add({
      action: 'billing_credit_grant',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id: body.lab_id,
      amount_paise: body.amount_paise,
      reason: body.reason,
      note: body.note,
      ledger_entry_id: ledgerRef.id,
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[admin/billing/grant] audit log write failed:', e);
  }

  return NextResponse.json({
    ok: true,
    lab_id: body.lab_id,
    new_balance_paise: newBalancePaise,
    ledger_entry_id: ledgerRef.id,
  });
}
