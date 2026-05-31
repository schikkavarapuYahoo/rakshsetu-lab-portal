import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';
import { STANDARD_FORMS } from '@/lib/forms';

export const runtime = 'nodejs';

/**
 * Test pricing API for labs.
 *
 *   GET  /api/lab-settings/test-pricing
 *        Returns merged pricing for the current lab — system defaults
 *        from STANDARD_FORMS overlaid with any per-lab overrides
 *        from labs/{labId}/test_pricing/{formId}. Each entry tells
 *        the client whether it's the default or a custom override.
 *
 *   PUT  /api/lab-settings/test-pricing
 *        Bulk update overrides. Body: { prices: { form_id: paise }[] }.
 *        - paise === null/undefined → delete the override (revert to default)
 *        - paise === number → set/update the override
 *
 * Authorization: lab session only. Per-lab pricing is configured by
 * the lab itself, not RakshSetu admin. Future: lab admin role
 * (Session F) will gate this away from technician-role staff.
 *
 * Storage: labs/{labId}/test_pricing/{formId} — small subcollection,
 * one doc per overridden test. Most labs will have <30 overrides
 * total. Subcollection rather than a map field on the lab doc to
 * keep the lab doc small and to allow fine-grained rule control.
 */

const PutPricingSchema = z.object({
  prices: z.array(
    z.object({
      form_id: z.string().min(1).max(100),
      // null/missing = remove override; number = set/update.
      // Validate range: 0 to ₹50,000 per test (reasonable max for
      // any single Indian lab test).
      price_paise: z.number().int().min(0).max(5_000_000).nullable(),
    }),
  ).max(100),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = adminDb();
  const labId = session.lab_id;

  try {
    // Read all per-lab overrides
    const overridesSnap = await db
      .collection('labs')
      .doc(labId)
      .collection('test_pricing')
      .get();

    const overrides = new Map<string, number>();
    for (const doc of overridesSnap.docs) {
      const data = doc.data();
      if (typeof data.price_paise === 'number') {
        overrides.set(doc.id, data.price_paise);
      }
    }

    // Merge with system defaults from STANDARD_FORMS. The shape is
    // intentionally one row per system test, so the UI always knows
    // what's available. If new tests get added to STANDARD_FORMS in
    // a code release, they automatically appear here without
    // requiring any per-lab migration.
    const rows = STANDARD_FORMS.map((f) => {
      const overridePaise = overrides.get(f.id);
      const has_override = overridePaise !== undefined;
      return {
        form_id: f.id,
        form_name: f.name,
        category: f.category,
        order: f.order,
        default_price_paise: f.default_price_paise,
        effective_price_paise: has_override
          ? (overridePaise as number)
          : f.default_price_paise,
        has_override,
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    console.error('[test-pricing GET] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: z.infer<typeof PutPricingSchema>;
  try {
    const json = await req.json();
    body = PutPricingSchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid input', detail: String(err) },
      { status: 400 },
    );
  }

  // Validate every form_id refers to a real form in STANDARD_FORMS.
  // We don't trust client to send valid form ids; rejecting unknown
  // ones prevents Firestore from filling up with junk overrides
  // that won't ever apply.
  const validFormIds = new Set(STANDARD_FORMS.map((f) => f.id));
  for (const p of body.prices) {
    if (!validFormIds.has(p.form_id)) {
      return NextResponse.json(
        { error: `Unknown form_id: ${p.form_id}` },
        { status: 400 },
      );
    }
  }

  const db = adminDb();
  const labId = session.lab_id;
  const collRef = db.collection('labs').doc(labId).collection('test_pricing');

  try {
    // Use a write batch — atomic, idempotent, fast for up to 100
    // entries. Above 100 we'd need to chunk; the schema cap above
    // already prevents that.
    const batch = db.batch();
    for (const p of body.prices) {
      const docRef = collRef.doc(p.form_id);
      if (p.price_paise === null) {
        // Delete the override — revert to system default
        batch.delete(docRef);
      } else {
        batch.set(docRef, {
          form_id: p.form_id,
          price_paise: p.price_paise,
          updated_at: FieldValue.serverTimestamp(),
          updated_by_lab_session: true,
        });
      }
    }
    await batch.commit();

    return NextResponse.json({ ok: true, updated: body.prices.length });
  } catch (e) {
    console.error('[test-pricing PUT] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
