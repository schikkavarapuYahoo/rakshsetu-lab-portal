import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import { normalizePhone } from '@/lib/phone_normalization';
import { getTierPrice, computeExpiresAt } from '@/lib/subscription_tiers';
import { MAX_EMAIL_LEN, MAX_NAME_LEN, MAX_PIN_LEN, MIN_PIN_LEN } from '@/server/limits';

export const runtime = 'nodejs';

/**
 * POST /api/admin/labs/create
 *
 * Provision a new lab. Used by reps in the field to onboard a lab
 * during their visit. The rep fills in the lab details, picks a code
 * (or system generates one), and sets the initial PIN.
 *
 * Lab gets:
 *   - status: 'pending' until rep marks 'active' (give them a chance
 *     to verify the lab actually wants to be on the platform before
 *     reports start flowing)
 *   - owned_by_staff_id: the rep who created it (commission tracking)
 *   - per_report_paise: pricing in paise (₹10 = 1000 paise default)
 *   - rev_share_pct: % we keep (60% default, lab keeps 40%)
 *
 * The PIN is shown ONCE in the response and never again. Rep must
 * write it down or share via secure channel with the lab owner.
 */

const CreateLabSchema = z.object({
  lab_name: z.string().min(2).max(MAX_NAME_LEN).trim(),
  lab_code: z.string().min(4).max(16).regex(/^[A-Z0-9-]+$/),
  pin: z.string().min(MIN_PIN_LEN).max(MAX_PIN_LEN),
  lab_address: z.string().min(5).max(300).trim(),
  lab_phone: z.string().regex(/^(\+?91)?[6-9]\d{9}$/, 'Invalid Indian phone'),
  lab_email: z.string().email().max(MAX_EMAIL_LEN).optional().or(z.literal('')),
  owner_name: z.string().max(80).optional(),
  owner_phone: z.string().regex(/^(\+?91)?[6-9]\d{9}$/).optional().or(z.literal('')),
  gst_number: z.string().max(20).optional(),
  // Pricing terms agreed with the lab during the visit
  per_report_paise: z.number().int().min(100).max(10000).optional(), // ₹1 - ₹100 cap
  rev_share_pct: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),

  // ── Round 9 Session D2: optional subscription plan at creation ──
  // If provided, the lab is created in "active" subscription state
  // for one billing cycle. If omitted, the lab lands in 'unset' state
  // and admin must record payment via the SubscriptionPanel before
  // the lab can submit reports. Either flow is valid; rep picks based
  // on whether the lab paid during onboarding.
  subscription_plan: z
    .enum(['basic', 'standard', 'growth', 'premium', 'payg'])
    .optional(),
  billing_cycle: z.enum(['monthly', 'annual']).optional(),
  payment_method: z.enum(['cash', 'upi', 'cheque', 'bank_transfer']).optional(),
  payment_reference: z.string().max(100).optional(),
  amount_collected_paise: z.number().int().min(0).max(100_000_000).optional(),
});

// Phone normalization centralized in @/lib/phone_normalization.
// (The previous local impl always forced +91 even for US/UK numbers.)

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'admin' && session.role !== 'rep') {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  let body: z.infer<typeof CreateLabSchema>;
  try {
    body = CreateLabSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const lab_code = body.lab_code.toUpperCase();
  const lab_phone = normalizePhone(body.lab_phone);

  try {
    const db = adminDb();

    // Uniqueness check on lab_code
    const existing = await db.collection('labs').where('lab_code', '==', lab_code).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json(
        { error: `Lab code ${lab_code} is already taken. Pick another.` },
        { status: 409 }
      );
    }

    const pin_hash = await bcrypt.hash(body.pin, 12);

    // ── Round 9 Session D2 (Blocker A1): subscription provisioning ──
    // If subscription_plan was provided, the rep collected payment
    // during the visit and the lab gets activated immediately.
    // Otherwise the lab lands in 'unset' state (no subscription_plan
    // field set) and admin records payment later via SubscriptionPanel.
    const now = new Date();
    const subscriptionFields: Record<string, unknown> = {};
    let historyEntry: Record<string, unknown> | null = null;

    if (body.subscription_plan && body.billing_cycle) {
      const expectedPrice = getTierPrice(
        body.subscription_plan,
        body.billing_cycle,
      );
      const expiresAt = computeExpiresAt(now, body.billing_cycle);

      subscriptionFields.subscription_plan = body.subscription_plan;
      subscriptionFields.subscription_active = true;
      subscriptionFields.subscription_billing_cycle = body.billing_cycle;
      subscriptionFields.subscription_started_at = Timestamp.fromDate(now);
      subscriptionFields.subscription_expires_at = Timestamp.fromDate(expiresAt);
      subscriptionFields.current_period_started_at = Timestamp.fromDate(now);
      subscriptionFields.current_period_report_count = 0;
      subscriptionFields.current_period_overage_count = 0;

      // Build a subscription_history entry mirroring the
      // /api/admin/labs/[id]/subscription endpoint's shape so the
      // SubscriptionPanel UI can render it the same way.
      historyEntry = {
        event_type: 'activated',
        from_plan: null,
        to_plan: body.subscription_plan,
        from_billing_cycle: null,
        to_billing_cycle: body.billing_cycle,
        amount_received_paise: body.amount_collected_paise ?? expectedPrice,
        expected_price_paise: expectedPrice,
        amount_matches_expected:
          (body.amount_collected_paise ?? expectedPrice) === expectedPrice,
        payment_method: body.payment_method ?? 'cash',
        payment_reference: body.payment_reference ?? '',
        recorded_by_staff_id: session.staff_id,
        recorded_by_staff_name: session.display_name,
        recorded_at: FieldValue.serverTimestamp(),
        notes: 'Recorded at lab creation',
      };
    }

    const labRef = db.collection('labs').doc();
    await labRef.set({
      lab_code,
      lab_name: body.lab_name,
      lab_address: body.lab_address,
      lab_phone,
      lab_email: body.lab_email || '',
      owner_name: body.owner_name || '',
      owner_phone: body.owner_phone ? normalizePhone(body.owner_phone) : '',
      gst_number: body.gst_number || '',
      pin_hash,
      status: 'pending', // rep flips to 'active' after lab confirms
      plan: 'pilot',
      // ── Pricing (existing field) ────────────────────────────────
      // per_report_paise is the canonical price field. Round 7
      // billing brief calls this `price_per_report_paise`; we kept
      // the existing name to avoid touching 6 read sites at once.
      // Rename can happen later as a focused refactor if needed.
      per_report_paise: body.per_report_paise ?? 1000, // ₹10 default
      rev_share_pct: body.rev_share_pct ?? 60,         // 60% to us
      // ── Round 7: credit-based billing fields ────────────────────
      // Initial balance is 0 — admin must explicitly grant trial
      // credits via /api/admin/billing/grant before the lab can
      // submit reports. Section 0.6 of the brief: "soft fail" on
      // out-of-credits, no silent creation.
      credit_balance: 0,
      low_balance_threshold_paise: 6000, // ₹60 = 10 reports at ₹6
      billing_status: 'active',          // active | suspended | trial
      trial_credits_granted_paise: 0,
      last_credit_event_at: null,
      // ─────────────────────────────────────────────────────────────
      // Round 9 Session D2: subscription fields (set only if plan
      // was provided at creation; otherwise admin records via
      // SubscriptionPanel later).
      ...subscriptionFields,
      // ─────────────────────────────────────────────────────────────
      owned_by_staff_id: session.staff_id,
      owned_by_staff_name: session.display_name,
      onboarded_via: 'admin_portal',
      notes: body.notes || '',
      created_at: FieldValue.serverTimestamp(),
      created_by_staff_id: session.staff_id,
      last_login_at: null,
      last_login_ip: null,
    });

    // Round 9 Session D2: write subscription_history entry if subscribed
    // at creation. Mirrors the shape used by the SubscriptionPanel.
    if (historyEntry) {
      await labRef
        .collection('subscription_history')
        .add(historyEntry);
    }

    // Audit
    await db.collection('staff_audit_logs').add({
      action: 'lab_created',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id: labRef.id,
      lab_code,
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      lab_id: labRef.id,
      lab_code,
      // PIN returned once — rep must capture this. Never returned again.
      pin: body.pin,
      message: 'Lab created. Share the lab_code and PIN with the lab owner via secure channel.',
    });
  } catch (err) {
    console.error('Create lab error:', err);
    return NextResponse.json({ error: 'Failed to create lab' }, { status: 500 });
  }
}
