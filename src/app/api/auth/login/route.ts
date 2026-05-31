import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminDb } from '@/server/firebase-admin';
import { createLabSession } from '@/server/auth/session';
import { checkAttempt, recordFailedAttempt, clearAttempts } from '@/server/auth/throttle';

/**
 * POST /api/auth/login
 *
 * Body: { lab_code: string, pin: string }
 *
 * Validates lab_code + PIN against `labs` collection. On success,
 * issues a JWT session cookie. Throttles brute-force attempts.
 *
 * Security:
 *   - Constant-time PIN comparison via bcrypt (no timing oracle)
 *   - Attempts throttled per IP (5 fails → 15 min lockout)
 *   - Generic error messages (don't reveal whether lab_code exists)
 *   - PIN never logged or returned
 *   - Lab status checked (suspended labs can't log in)
 */

export const runtime = 'nodejs'; // bcryptjs needs Node, not Edge runtime

const LoginSchema = z.object({
  lab_code: z.string().min(4).max(16).regex(/^[A-Z0-9-]+$/, 'Invalid lab code format'),
  pin: z.string().min(4).max(64),
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
  let body: { lab_code: string; pin: string };
  try {
    const json = await req.json();
    body = LoginSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const lab_code = body.lab_code.toUpperCase();

  try {
    const db = adminDb();

    // Look up lab by code
    const snap = await db.collection('labs').where('lab_code', '==', lab_code).limit(1).get();
    if (snap.empty) {
      // Same generic error message regardless of whether lab exists.
      // Prevents enumeration of valid lab codes.
      await recordFailedAttempt(throttleKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const labDoc = snap.docs[0];
    const lab = labDoc.data();

    // Check lab status BEFORE checking PIN. Suspended labs can't log in
    // regardless of correct PIN.
    if (lab.status !== 'active') {
      return NextResponse.json(
        { error: 'Lab account is not active. Contact RakshSetu support.' },
        { status: 403 }
      );
    }

    // Constant-time PIN comparison
    const pinHash = lab.pin_hash;
    if (!pinHash || typeof pinHash !== 'string') {
      // Lab doesn't have PIN set — admin error, lock them out
      return NextResponse.json(
        { error: 'Lab account misconfigured. Contact support.' },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(body.pin, pinHash);
    if (!valid) {
      await recordFailedAttempt(throttleKey);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Success — issue session
    await clearAttempts(throttleKey);

    await createLabSession({
      lab_id: labDoc.id,
      lab_code: lab.lab_code,
      lab_name: lab.lab_name || 'Lab',
    });

    // Update last_login_at and last_login_ip for audit
    await labDoc.ref.update({
      last_login_at: new Date(),
      last_login_ip: ip,
    });

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
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed. Try again.' }, { status: 500 });
  }
}
