import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';

export const runtime = 'nodejs';

/**
 * POST /api/admin/labs/[lab_id]/reset-pin
 *
 * Rotate a lab's PIN. Used when:
 *   - Lab tech leaves and old PIN may have been shared
 *   - Lab forgot PIN
 *   - Rep wants to enforce a fresh PIN at quarterly check-in
 *
 * Reps can reset PINs only on labs they own. Admins on any lab.
 *
 * The new PIN is returned ONCE in the response. Caller (rep) is
 * responsible for sharing it with the lab via secure channel.
 */

const ResetPinSchema = z.object({
  new_pin: z.string().min(6).max(64),
});

export async function POST(
  req: NextRequest,
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

  let body: { new_pin: string };
  try {
    body = ResetPinSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input — PIN min 6 chars' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const labRef = db.collection('labs').doc(lab_id);
    const labSnap = await labRef.get();
    if (!labSnap.exists) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }

    if (session.role === 'rep') {
      const lab = labSnap.data()!;
      if (lab.owned_by_staff_id !== session.staff_id) {
        return NextResponse.json({ error: 'You don\'t own this lab' }, { status: 403 });
      }
    }

    const pin_hash = await bcrypt.hash(body.new_pin, 12);
    await labRef.update({
      pin_hash,
      pin_rotated_at: FieldValue.serverTimestamp(),
      pin_rotated_by_staff_id: session.staff_id,
    });

    await db.collection('staff_audit_logs').add({
      action: 'lab_pin_reset',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id,
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, new_pin: body.new_pin });
  } catch (err) {
    console.error('Reset PIN error:', err);
    return NextResponse.json({ error: 'Failed to reset PIN' }, { status: 500 });
  }
}
