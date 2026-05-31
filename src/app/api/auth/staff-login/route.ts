import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminDb } from '@/server/firebase-admin';
import { createStaffSession } from '@/server/auth/session';
import { checkAttempt, recordFailedAttempt, clearAttempts } from '@/server/auth/throttle';
import { MAX_EMAIL_LEN, MAX_PASSWORD_LEN } from '@/server/limits';

/**
 * POST /api/auth/staff-login
 *
 * Body: { email: string, password: string }
 *
 * For your sales reps and you (admin). Looks up `staff` collection by
 * email, verifies bcrypt password, issues role-aware session.
 *
 * Why a separate endpoint from lab login?
 *   - Different credentials (email+pw vs lab_code+PIN)
 *   - Different success behavior (redirect to /admin not /dashboard)
 *   - Reps shouldn't even know about /api/auth/login (lab kiosk)
 *
 * Throttle: same IP-based 5 fails → 15-min lockout. Per-email throttle
 * also applied so credential stuffing against one specific email is
 * detected even when distributed across IPs.
 */

export const runtime = 'nodejs';

const StaffLoginSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LEN).toLowerCase(),
  password: z.string().min(1).max(MAX_PASSWORD_LEN),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  let body: { email: string; password: string };
  try {
    const json = await req.json();
    body = StaffLoginSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Throttle by both IP and email — credential stuffing detection
  const ipKey = `staff_login_ip:${ip}`;
  const emailKey = `staff_login_email:${body.email}`;
  for (const key of [ipKey, emailKey]) {
    const t = await checkAttempt(key);
    if (!t.allowed) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.', retry_after_seconds: t.retryAfterSeconds },
        { status: 429 }
      );
    }
  }

  try {
    const db = adminDb();
    const snap = await db.collection('staff').where('email', '==', body.email).limit(1).get();
    if (snap.empty) {
      await recordFailedAttempt(ipKey);
      await recordFailedAttempt(emailKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const staffDoc = snap.docs[0];
    const staff = staffDoc.data();

    if (staff.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is not active. Contact RakshSetu admin.' },
        { status: 403 }
      );
    }

    if (!staff.password_hash || typeof staff.password_hash !== 'string') {
      return NextResponse.json(
        { error: 'Account not yet provisioned. Contact admin.' },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(body.password, staff.password_hash);
    if (!valid) {
      await recordFailedAttempt(ipKey);
      await recordFailedAttempt(emailKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (staff.role !== 'rep' && staff.role !== 'admin') {
      // Sanity guard — should never happen, but if a misconfigured doc
      // has weird role we don't want to issue a session for it.
      return NextResponse.json({ error: 'Account misconfigured' }, { status: 500 });
    }

    await clearAttempts(ipKey);
    await clearAttempts(emailKey);

    await createStaffSession({
      staff_id: staffDoc.id,
      email: staff.email,
      display_name: staff.display_name || staff.email.split('@')[0],
      role: staff.role,
    });

    await staffDoc.ref.update({
      last_login_at: new Date(),
      last_login_ip: ip,
    });

    return NextResponse.json({
      ok: true,
      staff: {
        staff_id: staffDoc.id,
        email: staff.email,
        display_name: staff.display_name,
        role: staff.role,
      },
    });
  } catch (err) {
    console.error('Staff login error:', err);
    return NextResponse.json({ error: 'Login failed. Try again.' }, { status: 500 });
  }
}
