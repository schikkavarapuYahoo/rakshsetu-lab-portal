import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/server/firebase-admin';
import { createLabSession, type LabStaffRole } from '@/server/auth/session';
import { checkAttempt, recordFailedAttempt, clearAttempts } from '@/server/auth/throttle';
import { MAX_EMAIL_LEN, MAX_PIN_LEN, MIN_PIN_LEN } from '@/server/limits';

/**
 * POST /api/auth/login
 *
 * Body: { email: string, pin: string }
 *
 * Multi-user login (May 2026): each lab has multiple staff entries
 * in the `lab_staff` collection. A staff member logs in with their
 * email + PIN. We look up the staff doc by email, validate the PIN,
 * read the associated lab, and issue a session that carries BOTH
 * the lab tenancy AND the staff identity. Every audit stamp
 * downstream attributes to the specific staff member, not "the lab"
 * generically.
 *
 * The legacy lab-level `pin_hash` field on `labs/{id}` is no longer
 * used at login — the migration script `migrate-to-multi-user.ts`
 * copies it into the first owner staff doc before this flow takes
 * effect.
 *
 * Security:
 *   - Constant-time PIN comparison via bcrypt (no timing oracle)
 *   - Attempts throttled per IP (5 fails → 15 min lockout)
 *   - Generic error messages (don't reveal whether email exists)
 *   - PIN never logged or returned
 *   - Lab status checked AND staff status checked
 */

export const runtime = 'nodejs'; // bcryptjs needs Node, not Edge runtime

const LoginSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LEN).toLowerCase(),
  pin: z.string().min(MIN_PIN_LEN).max(MAX_PIN_LEN),
});

export async function POST(req: NextRequest) {
  // Identify the requester by IP for rate limiting. Falls back to a
  // header that proxies set; ultimately we accept some inaccuracy to
  // not block legitimate users behind shared NAT.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const throttleKey = `login:${ip}`;
  const throttle = await checkAttempt(throttleKey);
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        error: 'Too many failed attempts. Try again later.',
        retry_after_seconds: throttle.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  // Parse + validate input
  let body: { email: string; pin: string };
  try {
    const json = await req.json();
    body = LoginSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const db = adminDb();

    // Look up staff by email (lowercased + validated above).
    const staffSnap = await db
      .collection('lab_staff')
      .where('email', '==', body.email)
      .limit(1)
      .get();
    if (staffSnap.empty) {
      // Same generic message regardless of whether email exists.
      await recordFailedAttempt(throttleKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const staffDoc = staffSnap.docs[0]!;
    const staff = staffDoc.data();

    if (staff.status !== 'active') {
      // Don't leak the difference between "doesn't exist" and "suspended"
      // for unauth callers — same 401.
      await recordFailedAttempt(throttleKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Constant-time PIN comparison
    const pinHash = staff.pin_hash;
    if (!pinHash || typeof pinHash !== 'string') {
      console.error('[auth/login] staff doc missing pin_hash:', staffDoc.id);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(body.pin, pinHash);
    if (!valid) {
      await recordFailedAttempt(throttleKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Load the associated lab. Staff with no lab_id is a data error.
    const labId = staff.lab_id as string | undefined;
    if (!labId) {
      console.error('[auth/login] staff doc missing lab_id:', staffDoc.id);
      return NextResponse.json({ error: 'Account misconfigured. Contact support.' }, { status: 403 });
    }
    const labRef = db.collection('labs').doc(labId);
    const labDoc = await labRef.get();
    if (!labDoc.exists) {
      console.error('[auth/login] staff references missing lab:', labId);
      return NextResponse.json({ error: 'Account misconfigured. Contact support.' }, { status: 403 });
    }
    const lab = labDoc.data()!;

    // Suspended labs lock everyone out, regardless of correct PIN.
    if (lab.status !== 'active') {
      return NextResponse.json(
        { error: 'Lab account is not active. Contact RakshSetu support.' },
        { status: 403 }
      );
    }

    // Success — issue session
    await clearAttempts(throttleKey);

    const staffRole: LabStaffRole =
      staff.role === 'owner' || staff.role === 'admin' || staff.role === 'technician'
        ? (staff.role as LabStaffRole)
        : 'technician';

    await createLabSession({
      lab_id: labDoc.id,
      lab_code: lab.lab_code,
      lab_name: lab.lab_name || 'Lab',
      staff_id: staffDoc.id,
      staff_email: staff.email,
      staff_display_name: staff.display_name || staff.email,
      staff_role: staffRole,
    });

    // Update last_login on both the lab (for admin's "last activity"
    // view) and the staff doc (for the team page).
    await Promise.all([
      labRef.update({
        last_login_at: new Date(),
        last_login_ip: ip,
      }),
      staffDoc.ref.update({
        last_login_at: FieldValue.serverTimestamp(),
        last_login_ip: ip,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      lab: {
        lab_id: labDoc.id,
        lab_code: lab.lab_code,
        lab_name: lab.lab_name,
        lab_address: lab.lab_address || '',
        lab_phone: lab.lab_phone || '',
        lab_email: lab.lab_email || '',
      },
      staff: {
        staff_id: staffDoc.id,
        email: staff.email,
        display_name: staff.display_name || staff.email,
        role: staffRole,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed. Try again.' }, { status: 500 });
  }
}
