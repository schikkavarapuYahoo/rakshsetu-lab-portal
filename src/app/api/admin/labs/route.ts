import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';

export const runtime = 'nodejs';

/**
 * GET /api/admin/labs
 *
 * Returns the list of labs.
 *   - admin: sees ALL labs across all reps
 *   - rep: sees ONLY labs they onboarded (owned_by_staff_id == self)
 *
 * This split is enforced server-side. A rep cannot scrape labs that
 * belong to another rep, even by manipulating client state.
 *
 * Search by name, code, phone is supported but applied client-side
 * after the server-side ownership filter.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'admin' && session.role !== 'rep') {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';

    const db = adminDb();
    let query = db.collection('labs').orderBy('created_at', 'desc').limit(500);

    // Reps see only their own labs. Admins see everything.
    if (session.role === 'rep') {
      query = db.collection('labs')
        .where('owned_by_staff_id', '==', session.staff_id)
        .orderBy('created_at', 'desc')
        .limit(500);
    }

    const snap = await query.get();
    let labs = snap.docs.map((d) => {
      const data = d.data();
      return {
        lab_id: d.id,
        lab_code: data.lab_code,
        lab_name: data.lab_name,
        lab_address: data.lab_address || '',
        lab_phone: data.lab_phone || '',
        lab_email: data.lab_email || '',
        owner_name: data.owner_name || '',
        gst_number: data.gst_number || '',
        plan: data.plan || 'free',
        per_report_paise: data.per_report_paise ?? 1000, // ₹10 default
        rev_share_pct: data.rev_share_pct ?? 60,         // 60% to us
        owned_by_staff_id: data.owned_by_staff_id || '',
        owned_by_staff_name: data.owned_by_staff_name || '',
        status: data.status || 'pending',
        created_at: data.created_at?.toDate?.()?.toISOString() || null,
        last_login_at: data.last_login_at?.toDate?.()?.toISOString() || null,
      };
    });

    if (search) {
      labs = labs.filter((l) =>
        l.lab_name.toLowerCase().includes(search) ||
        l.lab_code.toLowerCase().includes(search) ||
        l.lab_phone.includes(search) ||
        l.lab_address.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ labs, total: labs.length });
  } catch (err) {
    console.error('List labs error:', err);
    return NextResponse.json({ error: 'Failed to load labs' }, { status: 500 });
  }
}
