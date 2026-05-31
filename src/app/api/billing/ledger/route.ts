import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/server/firebase-admin';
import { requireLabSession } from '@/server/auth/session';
import { clampPageLimit } from '@/server/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/ledger?limit=50&before=<iso>
 *
 * Lab self-view of its own credit_ledger entries. Powers the
 * transaction history table on the /billing page.
 *
 * Lab session only — and unlike the admin version of this endpoint,
 * there is no `lab_id` query param. The session's lab_id is the
 * only one a lab can read from. That's the security boundary —
 * a lab cannot ask for another lab's history by guessing IDs.
 *
 * Pagination: cursor on created_at (descending). Pass the
 * `next_before` value from one response back as `?before=` for the
 * next page. See the admin version for rationale on cursor vs
 * offset.
 *
 * Limits:
 *   - Default page size: 50
 *   - Max page size: 200 (so we don't accidentally return a huge
 *     blob to a slow lab connection)
 *
 * Returns:
 *   {
 *     entries: Array<{
 *       id, direction, amount_paise, reason, balance_after_paise,
 *       linked_doc_path, actor_type, created_at,
 *       metadata: { ... only safe fields ... }
 *     }>,
 *     has_more: boolean,
 *     next_before: string | null
 *   }
 *
 * Field omissions vs the admin version:
 *   - actor_id, actor_ip — these are useful for the admin doing
 *     forensics ("who did this grant from where?") but not for the
 *     lab self-view. The lab knows their own actions; admin-actor
 *     entries surface the admin name through metadata.admin_name
 *     which is enough context.
 *   - metadata.admin_email — same reason. We surface admin_name
 *     (display) but not admin_email (PII for the admin staff
 *     member; lab doesn't need it).
 */

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json(
      { error: 'Lab session required' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const limit = clampPageLimit(url.searchParams.get('limit'));
  const beforeIso = url.searchParams.get('before');
  const beforeDate = beforeIso ? new Date(beforeIso) : null;
  if (beforeIso && (!beforeDate || isNaN(beforeDate.getTime()))) {
    return NextResponse.json(
      { error: 'Invalid `before` cursor — must be ISO datetime' },
      { status: 400 }
    );
  }

  const db = adminDb();
  let q = db
    .collection('credit_ledger')
    .where('lab_id', '==', session.lab_id)
    .orderBy('created_at', 'desc')
    .limit(limit + 1); // +1 to detect has_more

  if (beforeDate) {
    q = q.startAfter(beforeDate);
  }

  const snap = await q.get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  const entries = docs.map((d) => {
    const data = d.data();
    // Filter metadata to only the lab-safe fields. We deliberately
    // strip admin_email and admin_id from admin-actor entries so
    // labs can't enumerate staff identities. admin_name is fine to
    // show — labs see "credited by Sarah" instead of full email.
    const fullMeta = data.metadata || {};
    const safeMeta: Record<string, unknown> = {};
    const allowedKeys = [
      // admin actions
      'note',
      'admin_name',
      // lab self-actions (debits)
      'form_id',
      'form_name',
      'patient_phone_last4',
      // future: razorpay_order_id, gst_invoice_id
      'razorpay_order_id',
      'gst_invoice_id',
    ];
    for (const k of allowedKeys) {
      if (k in fullMeta) safeMeta[k] = fullMeta[k];
    }

    return {
      id: d.id,
      direction: data.direction,
      amount_paise: data.amount_paise,
      reason: data.reason,
      balance_after_paise: data.balance_after_paise,
      linked_doc_path: data.linked_doc_path ?? null,
      actor_type: data.actor_type,
      metadata: safeMeta,
      created_at:
        data.created_at?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  const nextBefore =
    hasMore && entries.length > 0
      ? entries[entries.length - 1].created_at
      : null;

  return NextResponse.json({
    entries,
    has_more: hasMore,
    next_before: nextBefore,
  });
}
