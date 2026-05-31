import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';

export const runtime = 'nodejs';

/**
 * POST /api/auth/change-pin
 *
 * Lab self-service PIN change. Requires the caller to:
 *   1. Be authenticated as a lab (not staff)
 *   2. Provide their CURRENT PIN — we re-verify before accepting
 *      the new one. This prevents a stolen-session attack from
 *      silently rotating the PIN and locking the legitimate user
 *      out.
 *
 * The new PIN is bcrypt-hashed with cost 12 to match the create
 * path. We do NOT issue a new session — the existing one stays
 * valid, mirroring the standard "you don't get logged out when
 * you change your password" behavior.
 *
 * Body:  { current_pin: "123456", new_pin: "654321" }
 * Reply: { ok: true } | { error: string } [4xx]
 */
const ChangePinSchema = z.object({
  current_pin: z.string().min(4).max(12),
  new_pin: z
    .string()
    .min(6, 'PIN must be 6 digits')
    .max(6, 'PIN must be 6 digits')
    .regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'lab') {
    return NextResponse.json(
      { error: 'Lab session required' },
      { status: 403 }
    );
  }

  let body: z.infer<typeof ChangePinSchema>;
  try {
    body = ChangePinSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Reject obvious weak PINs. We don't enforce a stronger policy
  // (the PIN is only one factor; lab_id is the other) but
  // "000000" / "123456" / repeating digits are uniquely bad.
  if (
    body.new_pin === '000000' ||
    body.new_pin === '123456' ||
    body.new_pin === '111111' ||
    /^(.)\1{5}$/.test(body.new_pin)
  ) {
    return NextResponse.json(
      { error: 'PIN is too weak. Avoid sequences and repeating digits.' },
      { status: 400 }
    );
  }
  if (body.new_pin === body.current_pin) {
    return NextResponse.json(
      { error: 'New PIN must be different from current PIN.' },
      { status: 400 }
    );
  }

  const db = adminDb();
  const labRef = db.collection('labs').doc(session.lab_id);
  const labDoc = await labRef.get();
  if (!labDoc.exists) {
    // Session refers to a deleted lab — log them out.
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
  }
  const lab = labDoc.data() as { pin_hash?: string; status?: string };

  if (lab.status !== 'active') {
    return NextResponse.json(
      { error: 'Lab account is not active.' },
      { status: 403 }
    );
  }

  if (!lab.pin_hash) {
    return NextResponse.json(
      { error: 'Lab account misconfigured. Contact support.' },
      { status: 500 }
    );
  }

  // Re-verify current PIN. Constant-time via bcrypt.compare.
  const currentValid = await bcrypt.compare(body.current_pin, lab.pin_hash);
  if (!currentValid) {
    return NextResponse.json(
      { error: 'Current PIN is incorrect.' },
      { status: 401 }
    );
  }

  // Hash and write the new PIN. We also stamp pin_changed_at for
  // audit + future "PIN is X days old, time to rotate" UX.
  try {
    const newHash = await bcrypt.hash(body.new_pin, 12);
    await labRef.update({
      pin_hash: newHash,
      pin_changed_at: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('change-pin write failed:', e);
    return NextResponse.json(
      { error: 'Could not save new PIN. Try again.' },
      { status: 500 }
    );
  }
}
