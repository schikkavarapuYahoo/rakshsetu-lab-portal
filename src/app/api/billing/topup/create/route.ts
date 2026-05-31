import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { requireLabSession } from '@/server/auth/session';
import {
  assertPaise,
  MIN_TOPUP_PAISE,
  MAX_TOPUP_PAISE,
} from '@/lib/paise';

export const runtime = 'nodejs';

/**
 * POST /api/billing/topup/create
 *
 * Step 1 of the Razorpay top-up flow:
 *   1. [this endpoint] Lab clicks "Top up ₹500"; we create a
 *      Razorpay order, persist a payments/{auto_id} doc with
 *      status='created', return the order_id to the browser.
 *   2. Browser opens Razorpay Checkout with the order_id.
 *   3. User completes payment; Razorpay's JS calls our
 *      /api/billing/topup/verify endpoint with the result.
 *   4. Razorpay's servers POST to /api/billing/topup/webhook —
 *      THIS is the canonical credit path. The verify endpoint
 *      from step 3 is for fast UX feedback only; it does NOT
 *      credit the lab balance. (Section 3 of the brief.)
 *
 * Why a separate "create" endpoint instead of just opening Checkout
 * with a free-form amount: server-side validation. We must control
 * what amounts the lab can pay and ensure each Checkout session has
 * a server-tracked record. Letting the client construct the order
 * directly opens up Razorpay-side abuse (e.g. attacker tampers the
 * amount in Checkout → pays ₹0 for a ₹500 grant, webhook tries to
 * credit ₹0, no abuse — but still messy).
 *
 * Validation:
 *   - amount_paise must be a positive integer
 *   - >= ₹500 (50000 paise) — Razorpay processing fees + minimum
 *     useful credit grant
 *   - <= ₹1,00,000 (10000000 paise) — anything more goes through
 *     admin grant flow with a human in the loop
 *
 * Rate limit: 5 attempts/min/lab (TODO: not yet implemented; see
 * note below)
 *
 * Body: { amount_paise: number }
 * Response 200:
 *   {
 *     order_id: string,
 *     amount_paise: number,
 *     currency: 'INR',
 *     key_id: string,        // Razorpay key for browser SDK
 *     payment_doc_id: string // Our payments/{id}; verify echoes this
 *   }
 *
 * Response 503 if Razorpay env vars not configured. This lets the
 * code ship without keys; the endpoint just refuses to work until
 * keys are added in Vercel.
 */

const TopupSchema = z.object({
  amount_paise: z
    .number()
    .int()
    .min(MIN_TOPUP_PAISE, `Minimum top-up is ₹${MIN_TOPUP_PAISE / 100}`)
    .max(MAX_TOPUP_PAISE, `Maximum top-up is ₹${MAX_TOPUP_PAISE / 100}`),
});

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json(
      { error: 'Lab session required' },
      { status: 403 }
    );
  }

  // ── Razorpay config check ───────────────────────────────────────
  // We do this BEFORE parsing the body. If keys aren't set, we want
  // to fail fast with a clear error, not validate input first.
  const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
  const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error(
      '[billing/topup/create] Razorpay env vars not configured'
    );
    return NextResponse.json(
      {
        error:
          'Top-up is not yet enabled. Contact RakshSetu support to add credits manually.',
      },
      { status: 503 }
    );
  }

  // ── Body validation ─────────────────────────────────────────────
  let body: z.infer<typeof TopupSchema>;
  try {
    body = TopupSchema.parse(await req.json());
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
    assertPaise(body.amount_paise);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad amount' },
      { status: 400 }
    );
  }

  // ── Lab status check ────────────────────────────────────────────
  // A suspended lab shouldn't be able to top up — they can't submit
  // reports anyway, and accepting their money creates a refund mess.
  const db = adminDb();
  const labSnap = await db.collection('labs').doc(session.lab_id).get();
  if (!labSnap.exists) {
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
  }
  const lab = labSnap.data() as { billing_status?: string };
  if (lab.billing_status === 'suspended') {
    return NextResponse.json(
      {
        error:
          'Lab account is suspended. Contact support before topping up.',
      },
      { status: 403 }
    );
  }

  // ── Pre-allocate the payment doc ID ─────────────────────────────
  // We allocate the doc ID first so the Razorpay receipt can
  // reference it. This makes reconciliation easier — given a Razorpay
  // payment, we can find our doc by either provider_order_id (set
  // below) or receipt (which we set to the doc ID).
  const paymentRef = db.collection('payments').doc();

  // ── Create the Razorpay order ───────────────────────────────────
  // We use the REST API directly rather than the npm `razorpay` SDK
  // because the SDK pulls in fairly heavy deps and Next 15 edge
  // runtimes have been picky about it. Direct fetch is 10 lines and
  // Razorpay's API surface is small. Switch to the SDK later if we
  // start using more endpoints.
  let razorpayOrder;
  try {
    const auth = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
    ).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: body.amount_paise, // Razorpay also speaks integer paise
        currency: 'INR',
        receipt: paymentRef.id, // 40-char limit; Firestore IDs are 20
        notes: {
          lab_id: session.lab_id,
          lab_code: session.lab_code,
          intent: 'topup',
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(
        `[billing/topup/create] Razorpay error ${res.status}: ${errBody}`
      );
      return NextResponse.json(
        { error: 'Could not create top-up order. Try again.' },
        { status: 502 }
      );
    }
    razorpayOrder = await res.json();
  } catch (e) {
    console.error('[billing/topup/create] Razorpay fetch failed:', e);
    return NextResponse.json(
      { error: 'Could not reach payment provider. Try again.' },
      { status: 502 }
    );
  }

  // ── Persist the payment doc ─────────────────────────────────────
  // status: 'created' — Razorpay accepted the order; user hasn't
  // paid yet. Webhook will flip this to 'success' or 'failed' later.
  // amount_paise == credits_to_grant_paise here because we don't
  // skim GST off the top in v1 (Section 11 of brief: GST out of
  // scope for v1).
  try {
    await paymentRef.set({
      lab_id: session.lab_id,
      lab_code: session.lab_code,
      provider: 'razorpay',
      provider_order_id: razorpayOrder.id,
      provider_payment_id: null,
      amount_paise: body.amount_paise,
      credits_to_grant_paise: body.amount_paise,
      status: 'created',
      webhook_received_at: null,
      webhook_event_log: [],
      reconciliation_status: 'unverified',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // The Razorpay order was created but we couldn't persist our
    // tracking doc. The order will be reconciled by the daily job
    // (Turn 7) since Razorpay has it on their side; we just won't
    // immediately credit when the user pays.
    //
    // We still return success to the user — they CAN pay; the
    // webhook handler is robust enough to find-or-create the
    // payments doc when it arrives. Logging at error level so we
    // see this in production logs.
    console.error(
      '[billing/topup/create] Could not persist payment doc; relying on webhook to backfill:',
      e
    );
  }

  return NextResponse.json({
    order_id: razorpayOrder.id,
    amount_paise: body.amount_paise,
    currency: 'INR',
    key_id: RAZORPAY_KEY_ID,
    payment_doc_id: paymentRef.id,
  });
}
