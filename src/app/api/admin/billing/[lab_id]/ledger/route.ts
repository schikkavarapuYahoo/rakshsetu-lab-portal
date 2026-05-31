import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/server/firebase-admin';
import { requireStaffSession } from '@/server/auth/session';
import { clampPageLimit } from '@/server/limits';

export const runtime = 'nodejs';

/**
 * GET /api/admin/billing/[lab_id]/ledger?limit=50&before=<iso>
 *
 * Admin / rep view of a single lab's credit ledger. Used by:
 *   - Admin lab-detail page when investigating a balance dispute
 *   - Reconciliation alerts ("balance != sum(ledger)") when humans
 *     need to walk the ledger to find what went wrong
 *
 * Security:
 *   - Admin can read any lab's ledger
 *   - Rep can read only labs they own (owned_by_staff_id == session.staff_id)
 *   - Lab session is rejected here (must use the lab-side ledger
 *     endpoint from Turn 4 which restricts to session.lab_id)
 *
 * Pagination via cursor on created_at, not offset. Firestore offset
 * is O(N) — paginating 1000 entries deep would scan all 1000 every
 * page. Cursor pagination scans only the page being returned.
 *
 * Response:
 *   {
 *     lab: { id, lab_code, lab_name, balance_paise, per_report_paise, billing_status },
 *     entries: Array<LedgerEntry>,
 *     has_more: boolean,
 *     next_before: string | null    // pass back as ?before= for next page
 *   }
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> }
) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    return NextResponse.json(
      { error: 'Staff access required' },
      { status: 403 }
    );
  }

  const { lab_id } = await params;
  const url = new URL(req.url);
  const limit = clampPageLimit(url.searchParams.get('limit'));
  const beforeIso = url.searchParams.get('before');
  const beforeDate = beforeIso ? new Date(beforeIso) : null;
  // If `before` was provided but couldn't be parsed, reject — silently
  // returning the unfiltered first page would mislead the caller into
  // thinking they were paginating when they weren't.
  if (beforeIso && (!beforeDate || isNaN(beforeDate.getTime()))) {
    return NextResponse.json(
      { error: 'Invalid `before` cursor — must be ISO datetime' },
      { status: 400 }
    );
  }

  const db = adminDb();
  const labRef = db.collection('labs').doc(lab_id);
  const labSnap = await labRef.get();
  if (!labSnap.exists) {
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
  }
  const lab = labSnap.data() as {
    lab_code?: string;
    lab_name?: string;
    credit_balance?: number;
    per_report_paise?: number;
    billing_status?: string;
    owned_by_staff_id?: string;
  };

  // Reps can only see labs they own. Admins see everything.
  if (session.role === 'rep' && lab.owned_by_staff_id !== session.staff_id) {
    return NextResponse.json(
      { error: "You don't own this lab" },
      { status: 403 }
    );
  }

  let q = db
    .collection('credit_ledger')
    .where('lab_id', '==', lab_id)
    .orderBy('created_at', 'desc')
    .limit(limit + 1); // +1 to detect has_more without a count() query

  if (beforeDate) {
    q = q.startAfter(beforeDate);
  }

  const snap = await q.get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  const entries = docs.map((d) => {
    const data = d.data();
    // Convert Firestore Timestamps to ISO strings for the API
    // boundary. Inside the app we use Timestamps; clients want ISO.
    return {
      id: d.id,
      lab_id: data.lab_id,
      direction: data.direction,
      amount_paise: data.amount_paise,
      reason: data.reason,
      balance_after_paise: data.balance_after_paise,
      linked_doc_path: data.linked_doc_path ?? null,
      actor_type: data.actor_type,
      actor_id: data.actor_id,
      actor_ip: data.actor_ip,
      metadata: data.metadata ?? null,
      created_at:
        data.created_at?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  // Cursor for next page = created_at of the last entry returned
  const nextBefore =
    hasMore && entries.length > 0
      ? entries[entries.length - 1].created_at
      : null;

  return NextResponse.json({
    lab: {
      id: lab_id,
      lab_code: lab.lab_code ?? '',
      lab_name: lab.lab_name ?? '',
      balance_paise: lab.credit_balance ?? 0,
      per_report_paise: lab.per_report_paise ?? 0,
      billing_status: lab.billing_status ?? 'active',
    },
    entries,
    has_more: hasMore,
    next_before: nextBefore,
  });
}
