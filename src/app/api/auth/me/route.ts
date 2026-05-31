import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';

export const runtime = 'nodejs';

/**
 * GET /api/auth/me
 *
 * Returns the currently logged-in user's profile. Shape varies by role:
 *   - lab: { role:'lab', lab: {...} }
 *   - rep / admin: { role:'rep'|'admin', staff: {...} }
 *
 * Returns 401 if no valid session — client should redirect to login.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    if (session.role === 'lab') {
      const labDoc = await adminDb().collection('labs').doc(session.lab_id).get();
      if (!labDoc.exists) {
        return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
      }
      const lab = labDoc.data()!;

      if (lab.status !== 'active') {
        return NextResponse.json({ error: 'Lab account suspended' }, { status: 403 });
      }

      return NextResponse.json({
        role: 'lab',
        lab: {
          lab_id: labDoc.id,
          lab_code: lab.lab_code,
          lab_name: lab.lab_name,
          lab_address: lab.lab_address || '',
          lab_phone: lab.lab_phone || '',
          lab_email: lab.lab_email || '',
          lab_logo_url: lab.lab_logo_url || '',
          plan: lab.plan || 'free',
        },
        // Per-user identity inside the lab — the welcome message,
        // avatar initials, and role-based UI hiding all attribute
        // to THIS staff member, not the lab generically.
        staff: {
          staff_id: session.staff_id,
          email: session.staff_email,
          display_name: session.staff_display_name,
          role: session.staff_role,
        },
      });
    }

    // Staff (rep or admin)
    const staffDoc = await adminDb().collection('staff').doc(session.staff_id).get();
    if (!staffDoc.exists) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    const staff = staffDoc.data()!;
    if (staff.status !== 'active') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }
    if (staff.role !== session.role) {
      // Role changed since token was issued — force re-login
      return NextResponse.json({ error: 'Session expired, please re-login' }, { status: 401 });
    }

    return NextResponse.json({
      role: staff.role,
      staff: {
        staff_id: staffDoc.id,
        email: staff.email,
        display_name: staff.display_name,
        role: staff.role,
        territory: staff.territory || '',
      },
    });
  } catch (err) {
    console.error('me error:', err);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}
