import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import { writeAudit, actorFromSession, clientMetaFromReq } from '@/server/audit/log';

export const runtime = 'nodejs';

/**
 * GET /api/reports?limit=50&search=...
 *
 * Returns recent reports for the logged-in lab. Supports search by
 * patient phone or name (prefix match). Capped at 100 results per
 * page for performance.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'lab') {
    return NextResponse.json({ error: 'Lab access required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';

  try {
    const db = adminDb();
    const query = db.collection('lab_reports')
      .where('lab_id', '==', session.lab_id)
      .orderBy('created_at', 'desc')
      .limit(search ? Math.min(limit * 4, 400) : limit); // overfetch when filtering client-side

    const snap = await query.get();
    let results = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        patient_name: data.patient_name_at_time || '',
        patient_phone: data.patient_phone_at_time || '',
        form_id: data.form_id,
        form_name: data.form_name || '',
        max_severity: data.max_severity || 'normal',
        flagged_count: (data.flagged_fields || []).length,
        test_date: data.test_date || '',
        created_at: data.created_at?.toDate?.()?.toISOString() || null,
      };
    });

    if (search) {
      results = results.filter((r) =>
        r.patient_name.toLowerCase().includes(search) ||
        r.patient_phone.includes(search)
      ).slice(0, limit);
    }

    void writeAudit({
      action: 'report.list',
      ...actorFromSession(session),
      target_kind: 'lab',
      target_id: session.lab_id,
      patient_phone_hash: null,
      metadata: { count: results.length, search_used: !!search },
      ...clientMetaFromReq(req),
    });

    return NextResponse.json({ reports: results });
  } catch (err) {
    console.error('Reports list error:', err);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}
