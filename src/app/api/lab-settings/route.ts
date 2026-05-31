import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLabSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import { MAX_EMAIL_LEN, MAX_NAME_LEN } from '@/server/limits';

export const dynamic = 'force-dynamic';

/**
 * Lab profile / letterhead settings — what shows up on report PDFs and
 * in the patient-facing portal. Persisted on the `labs/{labId}` doc so
 * a refresh, device switch, or staff rotation all see the same identity.
 *
 * Schema accepts every optional field — UI partial-updates are common
 * (e.g. lab edits the signature block independently of the address).
 */
const SettingsSchema = z.object({
  lab_name: z.string().max(MAX_NAME_LEN).optional(),
  lab_address: z.string().max(300).optional(),
  lab_phone: z.string().max(20).optional(),
  lab_email: z.string().max(MAX_EMAIL_LEN).optional(),
  authorized_signatory: z.string().max(80).optional(),
  signatory_role: z.string().max(MAX_NAME_LEN).optional(),
  lab_logo_url: z.string().max(500).optional(),
  nabl_number: z.string().max(40).optional(),
  license_number: z.string().max(40).optional(),
  gstin: z.string().max(40).optional(),
  whatsapp_business_number: z.string().max(20).optional(),
  whatsapp_template: z.string().max(2000).optional(),
});

const PROFILE_FIELDS = [
  'lab_name',
  'lab_address',
  'lab_phone',
  'lab_email',
  'authorized_signatory',
  'signatory_role',
  'lab_logo_url',
  'nabl_number',
  'license_number',
  'gstin',
  'whatsapp_business_number',
  'whatsapp_template',
] as const;

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'validation failed' },
      { status: 400 },
    );
  }

  // Only write fields the client actually sent — keeps the merge
  // partial and avoids clobbering values the form didn't touch.
  // Empty string is a valid "clear this field" signal (e.g., lab
  // removing their NABL number); only `undefined` means "no change".
  const update: Record<string, string> = {};
  for (const key of PROFILE_FIELDS) {
    const v = parsed.data[key];
    if (v !== undefined) update[key] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    await adminDb()
      .collection('labs')
      .doc(session.lab_id as string)
      .update(update);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('lab-settings update failed:', msg);
    return NextResponse.json({ error: 'failed to save' }, { status: 500 });
  }
}

/**
 * GET /api/lab-settings — read the current lab profile back so the
 * zustand store can hydrate from canonical Firestore state on boot.
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const snap = await adminDb()
      .collection('labs')
      .doc(session.lab_id as string)
      .get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'lab not found' }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const profile: Record<string, string> = {};
    for (const key of PROFILE_FIELDS) {
      profile[key] = typeof data[key] === 'string' ? data[key] : '';
    }
    return NextResponse.json({ profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('lab-settings load failed:', msg);
    return NextResponse.json({ error: 'failed to load' }, { status: 500 });
  }
}
