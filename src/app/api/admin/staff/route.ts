import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import {
  MAX_EMAIL_LEN,
  MAX_NAME_LEN,
  MAX_PASSWORD_LEN,
  MIN_PASSWORD_LEN,
} from '@/server/limits';

export const runtime = 'nodejs';

/**
 * GET /api/admin/staff
 *   List all staff. Admin-only.
 *
 * POST /api/admin/staff
 *   Create a new staff member (rep or admin). Admin-only.
 *   Returns the temporary password ONCE.
 */

const CreateStaffSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LEN).toLowerCase(),
  password: z.string().min(MIN_PASSWORD_LEN).max(MAX_PASSWORD_LEN),
  display_name: z.string().min(2).max(MAX_NAME_LEN),
  role: z.enum(['rep', 'admin']),
  territory: z.string().max(80).optional(),
  phone: z.string().regex(/^(\+?91)?[6-9]\d{9}$/).optional().or(z.literal('')),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const snap = await adminDb().collection('staff').orderBy('created_at', 'desc').get();
    const staff = snap.docs.map((d) => {
      const data = d.data();
      return {
        staff_id: d.id,
        email: data.email,
        display_name: data.display_name,
        role: data.role,
        territory: data.territory || '',
        phone: data.phone || '',
        status: data.status,
        labs_owned: data.labs_owned_count || 0,
        last_login_at: data.last_login_at?.toDate?.()?.toISOString() || null,
        created_at: data.created_at?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ staff });
  } catch (err) {
    console.error('List staff error:', err);
    return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: z.infer<typeof CreateStaffSchema>;
  try {
    body = CreateStaffSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const existing = await db.collection('staff').where('email', '==', body.email).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(body.password, 12);
    const staffRef = db.collection('staff').doc();
    await staffRef.set({
      email: body.email,
      password_hash,
      display_name: body.display_name,
      role: body.role,
      territory: body.territory || '',
      phone: body.phone || '',
      status: 'active',
      labs_owned_count: 0,
      created_at: FieldValue.serverTimestamp(),
      created_by_admin_id: session.staff_id,
      last_login_at: null,
    });

    await db.collection('staff_audit_logs').add({
      action: 'staff_created',
      staff_id: session.staff_id,
      staff_email: session.email,
      target_staff_id: staffRef.id,
      target_email: body.email,
      target_role: body.role,
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      staff_id: staffRef.id,
      // Temp password returned once; admin shares with new hire
      temp_password: body.password,
    });
  } catch (err) {
    console.error('Create staff error:', err);
    return NextResponse.json({ error: 'Failed to create staff' }, { status: 500 });
  }
}
