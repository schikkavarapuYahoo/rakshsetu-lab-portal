import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';
import { emptyDraft, type DraftBatch } from '@/lib/draft_batch';

export const runtime = 'nodejs';

/**
 * Draft batch API — manages the lab's current in-progress multi-test
 * report.
 *
 *   GET    /api/draft-batch       — fetch current draft (creates empty if none)
 *   PUT    /api/draft-batch       — replace current draft entirely
 *   DELETE /api/draft-batch       — discard current draft
 *
 * Drafts are scoped to the lab session, NOT to a specific staff
 * member. Once Session F (lab admin/technician roles) lands, this
 * should be scoped per-staff.
 *
 * Storage: labs/{labId}/draft_batches/current
 *   — Single doc per lab. The fixed doc id "current" simplifies
 *     reads (no listing). When a tech submits, the doc is deleted.
 */

const DraftPatientSchema = z.object({
  name: z.string().max(200),
  phone: z.string().max(20),
  email: z.string().email().max(200).or(z.literal('')).nullable(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  age: z.number().int().min(0).max(150).nullable(),
  sex: z.enum(['M', 'F', 'O']).nullable(),
  height_cm: z.number().min(0).max(300).nullable(),
  weight_kg: z.number().min(0).max(500).nullable(),
  pregnancy_status: z.enum(['no', 'yes', 'unknown']).nullable(),
  fasting_status: z
    .enum(['fasted', 'non_fasted', 'random', 'post_prandial'])
    .nullable(),
  referral_source: z.enum(['walk_in', 'doctor']).default('walk_in'),
  referring_doctor: z.string().max(200).nullable(),
  referring_doctor_phone: z.string().max(20).nullable(),
  referring_doctor_specialty: z.string().max(120).nullable(),
  referring_doctor_reg_no: z.string().max(60).nullable(),
  hospital_name: z.string().max(200).nullable(),
  hospital_phone: z.string().max(20).nullable(),
  patient_address: z.string().max(500).nullable(),
  city: z.string().max(100).nullable(),
  pincode: z.string().regex(/^\d{0,6}$/).nullable(),
  reason_for_test: z.string().max(200).nullable(),
  collected_at_home: z.boolean(),
  collection_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sample_id: z.string().max(100).nullable(),
});

const DraftTestSchema = z.object({
    form_id: z.string().min(1).max(100),
    form_name: z.string().min(1).max(200),
    category: z.string().min(1).max(50),
    status: z.enum(['pending', 'in_progress', 'completed', 'partial']),
    // Zod v4: z.record requires both key + value schemas. v3 inferred
    // the key as string automatically.
    values: z.record(z.string(), z.union([z.number(), z.string()])),
    price_paise: z.number().int().min(0).max(10_000_000).optional(),
    added_by_panel: z.string().min(1).max(100).optional(),
  });

const PutDraftSchema = z.object({
  patient: DraftPatientSchema,
  tests: z.array(DraftTestSchema).max(50),
  current_step: z.enum(['patient', 'tests', 'values', 'review']),
});

/**
 * GET — fetch current draft. If none exists, returns an empty draft
 * shell (NOT a 404; the UI always has something to render).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = adminDb();
  const draftRef = db
    .collection('labs')
    .doc(session.lab_id)
    .collection('draft_batches')
    .doc('current');

  try {
    const doc = await draftRef.get();
    if (!doc.exists) {
      // Return empty shell — UI renders fresh form. We do NOT write
      // an empty draft here because the user might just be checking
      // ("do I have a draft?") and we don't want to clutter Firestore.
      return NextResponse.json({
        exists: false,
        draft: emptyDraft(session.lab_id),
      });
    }
    const data = doc.data() as DraftBatch;
    return NextResponse.json({
      exists: true,
      draft: serializeDraft(data),
    });
  } catch (e) {
    console.error('[draft-batch GET] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * PUT — write/replace the entire draft. Idempotent.
 *
 * We use full-document writes rather than incremental field updates
 * because:
 *   - The frontend already maintains the full state in memory; sending
 *     deltas would add complexity for no real win
 *   - Drafts are small (<5KB even with 20 tests); bandwidth is fine
 *   - Atomic — no partial-write states
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: z.infer<typeof PutDraftSchema>;
  try {
    const json = await req.json();
    body = PutDraftSchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid input', detail: String(err) },
      { status: 400 },
    );
  }

  const db = adminDb();
  const draftRef = db
    .collection('labs')
    .doc(session.lab_id)
    .collection('draft_batches')
    .doc('current');

  try {
    // Read existing to preserve `created_at` and per-test `added_at`/
    // `completed_at` (which the client may not have).
    const existing = await draftRef.get();
    const existingData = existing.exists ? (existing.data() as DraftBatch) : null;
    const existingTests = existingData?.tests ?? [];

    // For each test in the new payload, preserve its `added_at` if it
    // already existed; stamp a new one if it's new. This avoids the
    // "all timestamps reset to 'now' on every PUT" bug.
    const now = Timestamp.now();
    const mergedTests = body.tests.map((t) => {
      const existing = existingTests.find((e) => e.form_id === t.form_id);
      const isFinalState = t.status === 'completed' || t.status === 'partial';
      return {
        ...t,
        added_at: existing?.added_at ?? now,
        completed_at: isFinalState
          ? existing?.completed_at ?? now
          : null,
      };
    });

    const draft: DraftBatch = {
      lab_id: session.lab_id,
      patient: body.patient,
      tests: mergedTests,
      current_step: body.current_step,
      created_at: existingData?.created_at ?? now,
      updated_at: FieldValue.serverTimestamp() as unknown as Timestamp,
    };

    await draftRef.set(draft);
    return NextResponse.json({ ok: true, draft: serializeDraft(draft) });
  } catch (e) {
    console.error('[draft-batch PUT] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/** DELETE — discard the current draft. */
export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = adminDb();
  const draftRef = db
    .collection('labs')
    .doc(session.lab_id)
    .collection('draft_batches')
    .doc('current');

  try {
    await draftRef.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[draft-batch DELETE] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Convert Firestore Timestamps to ISO strings for JSON. The wire
 * format has plain strings; the Firestore docs have Timestamp
 * objects.
 */
function serializeDraft(d: DraftBatch): unknown {
  return {
    lab_id: d.lab_id,
    patient: d.patient,
    tests: d.tests.map((t) => ({
      form_id: t.form_id,
      form_name: t.form_name,
      category: t.category,
      status: t.status,
      values: t.values,
      price_paise: t.price_paise,
      added_by_panel: t.added_by_panel,
      added_at: tsToIso(t.added_at),
      completed_at: tsToIso(t.completed_at),
    })),
    current_step: d.current_step,
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
  };
}

function tsToIso(t: Timestamp | Date | null | undefined): string | null {
  if (!t) return null;
  if (t instanceof Date) return t.toISOString();
  if (typeof (t as Timestamp).toDate === 'function') {
    return (t as Timestamp).toDate().toISOString();
  }
  return null;
}
