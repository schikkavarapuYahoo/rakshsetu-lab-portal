import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';

export const runtime = 'nodejs';

/**
 * GET /api/admin/labs/[lab_id]/detail
 *
 * Single-lab view with metrics:
 *   - Lab info
 *   - Total reports submitted
 *   - Reports last 7 / 30 days
 *   - Critical / warning counts
 *   - Estimated revenue (reports × per_report_paise / 100 × rev_share_pct / 100)
 *
 * Reps can only view labs they own. Admins can view any lab.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'admin' && session.role !== 'rep') {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { lab_id } = await params;

  try {
    const db = adminDb();
    const labSnap = await db.collection('labs').doc(lab_id).get();
    if (!labSnap.exists) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    const lab = labSnap.data()!;

    if (session.role === 'rep' && lab.owned_by_staff_id !== session.staff_id) {
      return NextResponse.json({ error: 'You don\'t own this lab' }, { status: 403 });
    }

    // Pull reports for metrics. The (lab_id, created_at) composite
    // query needs a Firestore composite index. On a fresh project the
    // index doesn't exist yet — catch + zero-fill so the detail page
    // still renders. The lifetime count is a single-field query and
    // works without an index, but we still wrap defensively to keep
    // first-day load from 500'ing.
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    let last7 = 0, last30 = 0, critical = 0, warning = 0;
    try {
      const recentSnap = await db.collection('lab_reports')
        .where('lab_id', '==', lab_id)
        .where('created_at', '>=', thirtyDaysAgo)
        .get();
      for (const doc of recentSnap.docs) {
        const data = doc.data();
        const ts = data.created_at?.toDate?.();
        if (!ts) continue;
        last30 += 1;
        if (ts >= sevenDaysAgo) last7 += 1;
        if (data.max_severity === 'critical') critical += 1;
        else if (data.max_severity === 'warning') warning += 1;
      }
    } catch (err) {
      console.warn('[admin/labs/detail] recent-reports query skipped:', err);
    }

    let lifetimeReports = 0;
    try {
      const lifetimeSnap = await db.collection('lab_reports')
        .where('lab_id', '==', lab_id)
        .count()
        .get();
      lifetimeReports = lifetimeSnap.data().count;
    } catch (err) {
      console.warn('[admin/labs/detail] lifetime count skipped:', err);
    }

    const perReportPaise = lab.per_report_paise ?? 1000;
    const revSharePct = lab.rev_share_pct ?? 60;
    const revenuePaise30d = Math.floor(last30 * perReportPaise * revSharePct / 100);
    const revenueLifetimePaise = Math.floor(lifetimeReports * perReportPaise * revSharePct / 100);

    return NextResponse.json({
      lab: {
        lab_id: labSnap.id,
        lab_code: lab.lab_code,
        lab_name: lab.lab_name,
        lab_address: lab.lab_address || '',
        lab_phone: lab.lab_phone || '',
        lab_email: lab.lab_email || '',
        owner_name: lab.owner_name || '',
        owner_phone: lab.owner_phone || '',
        gst_number: lab.gst_number || '',
        plan: lab.plan || 'free',
        per_report_paise: perReportPaise,
        rev_share_pct: revSharePct,
        // Round 7 billing fields. Defaults match what the migration
        // script set; reading any lab that pre-dates Round 7
        // shouldn't crash.
        credit_balance: typeof lab.credit_balance === 'number' ? lab.credit_balance : 0,
        billing_status: lab.billing_status || 'active',
        owned_by_staff_id: lab.owned_by_staff_id || '',
        owned_by_staff_name: lab.owned_by_staff_name || '',
        notes: lab.notes || '',
        status: lab.status || 'pending',
        created_at: lab.created_at?.toDate?.()?.toISOString() || null,
        last_login_at: lab.last_login_at?.toDate?.()?.toISOString() || null,
      },
      metrics: {
        reports_last_7d: last7,
        reports_last_30d: last30,
        reports_lifetime: lifetimeReports,
        critical_count_30d: critical,
        warning_count_30d: warning,
        // Paise to rupees in client. Showing both for clarity.
        revenue_30d_paise: revenuePaise30d,
        revenue_lifetime_paise: revenueLifetimePaise,
      },
    });
  } catch (err) {
    console.error('Lab detail error:', err);
    return NextResponse.json({ error: 'Failed to load lab' }, { status: 500 });
  }
}
