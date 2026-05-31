import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';
import {
  TIERS,
  getTierPrice,
  computeExpiresAt,
} from '@/lib/subscription_tiers';

export const runtime = 'nodejs';

/**
 * POST /api/admin/labs/[lab_id]/subscription
 *
 * Records a payment received from a lab and activates/extends their
 * subscription. This is the manual cash/UPI/cheque collection model —
 * sales rep collects money offline, then admin clicks the "Record
 * payment" button in the portal which calls this route.
 *
 * Body:
 *   {
 *     tier: 'basic' | 'standard' | 'growth' | 'premium' | 'payg',
 *     billing_cycle: 'monthly' | 'annual',
 *     amount_received_paise: number,    -- what the lab actually paid
 *     payment_method: 'cash' | 'upi' | 'cheque' | 'bank_transfer' | 'other',
 *     payment_reference: string,        -- UPI ref / cheque no / etc.
 *     effective_from?: ISO8601 string,  -- defaults to now
 *     notes?: string
 *   }
 *
 * Behavior:
 *   - Reads current lab doc inside transaction
 *   - Computes new effective_from + effective_until
 *     (if currently active, extends from current expires_at)
 *     (if expired or unset, starts from now or specified effective_from)
 *   - Resets current_period_* counters when extending into a new
 *     billing period (so the lab gets a fresh cap allowance)
 *   - Writes lab doc + subscription_history entry atomically
 *
 * Authorization:
 *   - Requires admin role (session.role === 'admin'). Sales reps
 *     CANNOT activate plans — they collect money, admin records it.
 *     This is intentional separation-of-duties: prevents a rep from
 *     pocketing cash and silently activating the lab.
 */

const RecordPaymentSchema = z.object({
  tier: z.enum(['basic', 'standard', 'growth', 'premium', 'payg']),
  billing_cycle: z.enum(['monthly', 'annual']),
  // Allow 0 for PAYG (no upfront fee). For other tiers, the actual
  // amount may differ from the listed price (negotiated discount,
  // partial payment, etc.) — we record what was received, not what
  // was expected.
  amount_received_paise: z.number().int().min(0).max(10_000_000), // up to ₹1L
  payment_method: z.enum(['cash', 'upi', 'cheque', 'bank_transfer', 'other']),
  payment_reference: z.string().min(1).max(200),
  effective_from: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> },
) {
  // Authorization: admin only
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — admin access required' },
      { status: 403 },
    );
  }

  const { lab_id } = await params;
  if (!lab_id || lab_id.length === 0 || lab_id.length > 64) {
    return NextResponse.json({ error: 'Invalid lab_id' }, { status: 400 });
  }

  // Parse + validate body
  let body: RecordPaymentInput;
  try {
    const json = await req.json();
    body = RecordPaymentSchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid input', detail: String(err) },
      { status: 400 },
    );
  }

  const db = adminDb();
  const labRef = db.collection('labs').doc(lab_id);
  const historyRef = labRef.collection('subscription_history').doc();
  const expectedPrice = getTierPrice(body.tier, body.billing_cycle);

  try {
    const result = await db.runTransaction(async (tx) => {
      // ── READ PHASE ──
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) {
        throw new Error('LAB_NOT_FOUND');
      }
      const lab = labDoc.data() ?? {};

      // ── COMPUTE NEW DATES ──
      //
      // If the lab currently has an active subscription with a future
      // expires_at, "extend" the subscription: new effective_from =
      // current expires_at (so they get the full new period without
      // losing time).
      //
      // If expired, new effective_from = body.effective_from || now.
      //
      // This means a lab paying for May on April 25 (still in April)
      // gets May 25 as their new expires_at if they're on monthly,
      // not April 25 + 1 month = May 25 (same — but if they paid on
      // April 5, they'd get the original March-15-to-April-15 period
      // extended to April-15 to May-15, NOT April-5 to May-5).
      //
      // The lab benefits from paying early.

      const now = new Date();
      const currentExpiresAt = (lab.subscription_expires_at as Timestamp | undefined)?.toDate() ?? null;

      let effectiveFrom: Date;
      let resetCounters: boolean;

      if (body.effective_from) {
        // Admin override — start the new period at a specific date.
        // Useful when correcting a prior recording mistake.
        effectiveFrom = new Date(body.effective_from);
        resetCounters = true;
      } else if (currentExpiresAt && currentExpiresAt > now) {
        // Currently active — extend from current expiration. Don't
        // reset counters (they're still in the same logical billing
        // period... wait, no, this extends to a new period). Reset.
        effectiveFrom = currentExpiresAt;
        resetCounters = true;
      } else {
        // Expired or unset — start fresh from now.
        effectiveFrom = now;
        resetCounters = true;
      }

      const expiresAt = computeExpiresAt(effectiveFrom, body.billing_cycle);

      // ── BUILD UPDATE PAYLOAD ──
      const updates: Record<string, unknown> = {
        subscription_plan: body.tier,
        subscription_active: true,
        subscription_billing_cycle: body.billing_cycle,
        subscription_started_at:
          // Preserve the very first activation date for cohort analytics.
          // Only set if not already set.
          lab.subscription_started_at ?? Timestamp.fromDate(now),
        subscription_expires_at: Timestamp.fromDate(expiresAt),
      };

      if (resetCounters) {
        updates.current_period_started_at = Timestamp.fromDate(effectiveFrom);
        updates.current_period_report_count = 0;
        updates.current_period_overage_count = 0;
      }

      // ── BUILD HISTORY ENTRY ──
      const historyEntry = {
        event_type: lab.subscription_plan ? 'extended' : 'activated',
        from_plan: lab.subscription_plan ?? null,
        to_plan: body.tier,
        from_billing_cycle: lab.subscription_billing_cycle ?? null,
        to_billing_cycle: body.billing_cycle,
        amount_received_paise: body.amount_received_paise,
        expected_price_paise: expectedPrice,
        // Flag if there's a discrepancy (e.g., negotiated discount).
        // Admin can review these in audit.
        amount_matches_expected:
          body.amount_received_paise === expectedPrice,
        payment_method: body.payment_method,
        payment_reference: body.payment_reference,
        effective_from: Timestamp.fromDate(effectiveFrom),
        effective_until: Timestamp.fromDate(expiresAt),
        notes: body.notes ?? '',
        // Note: staff sessions have `staff_id` (not `uid`). LabSessionPayload
        // would have `lab_id` but this route is admin-only so the session
        // is guaranteed to be StaffSessionPayload.
        actor_staff_id: 'staff_id' in session ? session.staff_id : '',
        actor_role: session.role,
        actor_name: 'display_name' in session ? session.display_name : '',
        created_at: FieldValue.serverTimestamp(),
      };

      // ── WRITE PHASE ──
      tx.update(labRef, updates);
      tx.set(historyRef, historyEntry);

      return {
        new_expires_at: expiresAt.toISOString(),
        new_effective_from: effectiveFrom.toISOString(),
        amount_matches_expected: historyEntry.amount_matches_expected,
        history_id: historyRef.id,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'LAB_NOT_FOUND') {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    console.error('[admin/subscription] error:', err);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/labs/[lab_id]/subscription
 *
 * Returns current subscription status + history. For admin UI panel.
 *
 * Response:
 *   {
 *     status: SubscriptionStatus,
 *     history: SubscriptionHistoryEntry[]   -- most recent first, capped at 50
 *   }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> },
) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'rep')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { lab_id } = await params;
  const db = adminDb();
  const labRef = db.collection('labs').doc(lab_id);

  try {
    const [labDoc, historySnap] = await Promise.all([
      labRef.get(),
      labRef
        .collection('subscription_history')
        .orderBy('created_at', 'desc')
        .limit(50)
        .get(),
    ]);

    if (!labDoc.exists) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }

    // Reps may only view subscription state for labs they personally
    // onboarded. Without this check, any rep could enumerate every
    // lab in the network by walking `/api/admin/labs/<lab_id>/subscription`.
    if (session.role === 'rep') {
      const ownedBy = labDoc.data()?.owned_by_staff_id;
      if (ownedBy !== session.staff_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Lazy import to avoid pulling state engine into all routes
    const { computeSubscriptionStatus } = await import('@/server/billing/subscription_state');
    const status = computeSubscriptionStatus(labDoc.data() ?? {});

    const history = historySnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Convert Timestamps to ISO for JSON
        effective_from: (data.effective_from as Timestamp | undefined)?.toDate().toISOString() ?? null,
        effective_until: (data.effective_until as Timestamp | undefined)?.toDate().toISOString() ?? null,
        created_at: (data.created_at as Timestamp | undefined)?.toDate().toISOString() ?? null,
      };
    });

    return NextResponse.json({
      status,
      history,
      tiers: TIERS, // include for client convenience
    });
  } catch (err) {
    console.error('[admin/subscription GET] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
