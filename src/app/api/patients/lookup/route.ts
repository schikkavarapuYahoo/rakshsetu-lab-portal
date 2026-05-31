import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/server/firebase-admin';
import { requireLabSession } from '@/server/auth/session';
import { normalizePhone } from '@/lib/phone_normalization';
import { writeAudit, hashPhone, actorFromSession, clientMetaFromReq } from '@/server/audit/log';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const phoneRaw = req.nextUrl.searchParams.get('phone') ?? '';
  if (!phoneRaw) {
    return NextResponse.json({ found: false });
  }

  let phone: string;
  try {
    phone = normalizePhone(phoneRaw);
  } catch {
    return NextResponse.json({ found: false });
  }

  try {
    const snap = await adminDb()
      .collection('lab_reports')
      .where('lab_id', '==', session.lab_id)
      .where('patient_phone_at_time', '==', phone)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ found: false });
    }

    const doc = snap.docs[0].data() as Record<string, unknown>;
    const gender = doc.patient_gender_at_time as string | undefined;
    const sex: 'M' | 'F' | 'O' | null =
      gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender === 'unspecified' ? null : null;

    const createdAt = doc.created_at as { toDate?: () => Date } | undefined;
    const lastVisitIso = createdAt?.toDate
      ? createdAt.toDate().toISOString()
      : null;

    void writeAudit({
      action: 'patient.lookup',
      ...actorFromSession(session),
      target_kind: 'patient',
      target_id: null,
      patient_phone_hash: hashPhone(phone),
      ...clientMetaFromReq(req),
    });

    return NextResponse.json({
      found: true,
      patient: {
        name: (doc.patient_name_at_time as string) ?? '',
        phone,
        age: (doc.patient_age_at_time as number | null) ?? null,
        sex,
        referring_doctor: (doc.referring_doctor as string) || null,
        last_visit_iso: lastVisitIso,
      },
    });
  } catch (err) {
    console.error('[patients/lookup] query failed:', err);
    return NextResponse.json({ found: false });
  }
}
