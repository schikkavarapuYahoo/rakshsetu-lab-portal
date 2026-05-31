import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';

export const runtime = 'nodejs';

/**
 * POST /api/auth/change-password
 *
 * Staff (admin / rep) self-service password change. Same shape as
 * the lab-side PIN change but for the email+password auth flow.
 *
 * Requires:
 *   1. Authenticated as staff (admin or rep)
 *   2. Current password — re-verified server-side. A stolen session
 *      should not be able to silently rotate the password and lock
 *      the rightful owner out.
 *
 * Password policy: min 10 chars, must include at least one letter
 * and one digit. Not maximally strict, but rejects the worst common
 * passwords ("password123") without being annoying. The threat model
 * here is dictionary attacks on harvested email lists, not
 * targeted attacks on a specific staff member; bcrypt cost 12 +
 * the existing IP/email throttle on /staff-login is the real
 * defense.
 *
 * Body:  { current_password, new_password }
 * Reply: { ok: true } | { error: string } [4xx]
 */
const ChangePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128, 'Password too long')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a digit'),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'admin' && session.role !== 'rep') {
    return NextResponse.json(
      { error: 'Staff session required' },
      { status: 403 }
    );
  }

  let body: z.infer<typeof ChangePasswordSchema>;
  try {
    body = ChangePasswordSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  if (body.new_password === body.current_password) {
    return NextResponse.json(
      { error: 'New password must differ from current password.' },
      { status: 400 }
    );
  }

  const db = adminDb();
  const staffRef = db.collection('staff').doc(session.staff_id);
  const staffDoc = await staffRef.get();
  if (!staffDoc.exists) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
  }
  const staff = staffDoc.data() as {
    password_hash?: string;
    status?: string;
  };

  if (staff.status === 'disabled') {
    return NextResponse.json(
      { error: 'Account is disabled.' },
      { status: 403 }
    );
  }

  if (!staff.password_hash) {
    return NextResponse.json(
      { error: 'Account misconfigured. Contact admin.' },
      { status: 500 }
    );
  }

  const currentValid = await bcrypt.compare(
    body.current_password,
    staff.password_hash
  );
  if (!currentValid) {
    return NextResponse.json(
      { error: 'Current password is incorrect.' },
      { status: 401 }
    );
  }

  try {
    const newHash = await bcrypt.hash(body.new_password, 12);
    await staffRef.update({
      password_hash: newHash,
      password_changed_at: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('change-password write failed:', e);
    return NextResponse.json(
      { error: 'Could not save new password. Try again.' },
      { status: 500 }
    );
  }
}
