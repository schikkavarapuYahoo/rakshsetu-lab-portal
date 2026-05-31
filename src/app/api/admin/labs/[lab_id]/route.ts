import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import { normalizePhone } from '@/lib/phone_normalization';
import { MAX_EMAIL_LEN, MAX_NAME_LEN } from '@/server/limits';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/labs/[lab_id]
 *
 * Update lab fields. Field-level access control:
 *   - Reps can update labs they own (owned_by_staff_id == self)
 *     - Allowed fields: lab_address, lab_phone, lab_email, owner_name,
 *       owner_phone, gst_number, notes, status (only pending → active
 *       transition; can't suspend or reactivate)
 *   - Admins can update any lab and any field including pricing,
 *     plan, status, ownership transfer
 *
 * Reps cannot:
 *   - Change pricing (per_report_paise, rev_share_pct)
 *   - Change ownership (transfer lab to another rep)
 *   - Suspend or reactivate labs that are already past pending
 *   - Change lab_code (hard requirement: codes are immutable once
 *     printed on QR posters distributed to patients)
 */

const UpdateLabSchema = z.object({
  lab_name: z.string().min(2).max(MAX_NAME_LEN).trim().optional(),
  lab_address: z.string().min(5).max(300).optional(),
  lab_phone: z.string().regex(/^(\+?91)?[6-9]\d{9}$/).optional(),
  lab_email: z.string().email().max(MAX_EMAIL_LEN).optional().or(z.literal('')),
  owner_name: z.string().max(80).optional(),
  owner_phone: z.string().regex(/^(\+?91)?[6-9]\d{9}$/).optional().or(z.literal('')),
  gst_number: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  // Admin-only fields
  per_report_paise: z.number().int().min(100).max(10000).optional(),
  rev_share_pct: z.number().int().min(0).max(100).optional(),
  plan: z.enum(['pilot', 'free', 'paid']).optional(),
  owned_by_staff_id: z.string().max(64).optional(),
});

const REP_ALLOWED_FIELDS = new Set([
  'lab_name', 'lab_address', 'lab_phone', 'lab_email',
  'owner_name', 'owner_phone', 'gst_number', 'notes', 'status',
]);

// Phone normalization centralized in @/lib/phone_normalization.
// The previous implementation here was simpler and broken for any
// non-Indian number (it always forced +91). The shared version handles
// US/UK/etc. correctly and is unit-tested.

export async function PATCH(
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

  let body: z.infer<typeof UpdateLabSchema>;
  try {
    body = UpdateLabSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const labRef = db.collection('labs').doc(lab_id);
    const labSnap = await labRef.get();
    if (!labSnap.exists) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }
    // Explicit type so `lab.status` is `string | undefined` instead of
    // whatever TypeScript narrows it to from initial-creation literals.
    // Without this annotation, TS sees `status: 'pending'` from the
    // create-lab route and decides every read of lab.status here can
    // only be 'pending' or 'active' — which makes the legitimate
    // `=== 'suspended'` check unreachable code.
    const lab = labSnap.data()! as {
      status?: string;
      owned_by_staff_id?: string;
      [key: string]: unknown;
    };

    // Rep ownership check
    if (session.role === 'rep') {
      if (lab.owned_by_staff_id !== session.staff_id) {
        return NextResponse.json({ error: 'You don\'t own this lab' }, { status: 403 });
      }
      // Reps can only do pending → active transition.
      // They cannot suspend or reactivate.
      if (body.status) {
        if (body.status === 'suspended') {
          return NextResponse.json({ error: 'Reps cannot suspend labs' }, { status: 403 });
        }
        // Past this point body.status is 'pending' | 'active' (TS
        // narrowed it). A suspended lab needs admin to reactivate;
        // reps blocked.
        if (lab.status === 'suspended') {
          return NextResponse.json({ error: 'Reactivation requires admin' }, { status: 403 });
        }
        if (lab.status !== 'pending' && body.status === 'pending') {
          return NextResponse.json({ error: 'Cannot revert to pending' }, { status: 403 });
        }
      }
      // Strip any field a rep can't change
      for (const k of Object.keys(body) as Array<keyof typeof body>) {
        if (!REP_ALLOWED_FIELDS.has(k)) {
          return NextResponse.json({ error: `Reps cannot change ${k}` }, { status: 403 });
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.lab_name !== undefined) updates.lab_name = body.lab_name;
    if (body.lab_address !== undefined) updates.lab_address = body.lab_address;
    if (body.lab_phone !== undefined) updates.lab_phone = normalizePhone(body.lab_phone);
    if (body.lab_email !== undefined) updates.lab_email = body.lab_email;
    if (body.owner_name !== undefined) updates.owner_name = body.owner_name;
    if (body.owner_phone !== undefined) updates.owner_phone = body.owner_phone ? normalizePhone(body.owner_phone) : '';
    if (body.gst_number !== undefined) updates.gst_number = body.gst_number;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.status !== undefined) updates.status = body.status;
    if (session.role === 'admin') {
      if (body.per_report_paise !== undefined) updates.per_report_paise = body.per_report_paise;
      if (body.rev_share_pct !== undefined) updates.rev_share_pct = body.rev_share_pct;
      if (body.plan !== undefined) updates.plan = body.plan;
      if (body.owned_by_staff_id !== undefined) {
        // Verify the new owner is an actual staff doc
        const newOwner = await db.collection('staff').doc(body.owned_by_staff_id).get();
        if (!newOwner.exists) {
          return NextResponse.json({ error: 'New owner staff not found' }, { status: 400 });
        }
        updates.owned_by_staff_id = body.owned_by_staff_id;
        updates.owned_by_staff_name = newOwner.data()?.display_name || '';
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = FieldValue.serverTimestamp();
    updates.updated_by_staff_id = session.staff_id;

    await labRef.update(updates);

    // Audit
    await db.collection('staff_audit_logs').add({
      action: 'lab_updated',
      staff_id: session.staff_id,
      staff_email: session.email,
      lab_id,
      changes: Object.keys(updates),
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Update lab error:', err);
    return NextResponse.json({ error: 'Failed to update lab' }, { status: 500 });
  }
}
