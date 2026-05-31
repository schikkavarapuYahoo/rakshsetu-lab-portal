import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { getSession } from "@/server/auth/session";
import {
  MAX_EMAIL_LEN,
  MAX_NAME_LEN,
  MAX_PIN_LEN,
  MIN_PIN_LEN,
} from "@/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-side surface of per-lab staff management. Lets the RakshSetu
 * SaaS-vendor team add or remove staff on behalf of a lab — useful
 * for support cases ("the owner forgot their PIN and is also the only
 * active owner; create a new owner for them").
 *
 * Scoped to admin role only. Reps cannot manage staff (avoids a rep
 * granting themselves owner credentials to a lab they technically
 * onboarded).
 */

async function ensureAdmin() {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 } as const;
  if (session.role !== "admin") {
    return { error: "Admin role required", status: 403 } as const;
  }
  return { session } as const;
}

/**
 * GET /api/admin/labs/[lab_id]/staff
 *
 * List all staff (active + suspended + removed) for one lab. Admins
 * see the full history, not just active staff, so they can audit
 * "who used to have access".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> },
) {
  const check = await ensureAdmin();
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { lab_id } = await params;
  try {
    const snap = await adminDb()
      .collection("lab_staff")
      .where("lab_id", "==", lab_id)
      .get();

    const staff = snap.docs.map((d) => {
      const data = d.data();
      return {
        staff_id: d.id,
        email: data.email,
        display_name: data.display_name || data.email,
        role: data.role,
        status: data.status,
        created_at: data.created_at?.toDate?.()?.toISOString() ?? null,
        last_login_at: data.last_login_at?.toDate?.()?.toISOString() ?? null,
      };
    });

    const roleOrder: Record<string, number> = {
      owner: 0,
      admin: 1,
      technician: 2,
    };
    const statusOrder: Record<string, number> = {
      active: 0,
      suspended: 1,
      removed: 2,
    };
    staff.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 9;
      const sb = statusOrder[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const ra = roleOrder[a.role] ?? 9;
      const rb = roleOrder[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.display_name.localeCompare(b.display_name);
    });

    return NextResponse.json({ staff });
  } catch (err) {
    console.error("[admin/labs/staff GET] failed:", err);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

/**
 * POST /api/admin/labs/[lab_id]/staff
 *
 * Admin-on-behalf-of: create a new staff member in a specific lab.
 * Same email uniqueness check as the lab-side route.
 */
const CreateSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LEN).toLowerCase(),
  display_name: z.string().min(1).max(MAX_NAME_LEN).trim(),
  role: z.enum(["owner", "admin", "technician"]),
  pin: z.string().min(MIN_PIN_LEN).max(MAX_PIN_LEN),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lab_id: string }> },
) {
  const check = await ensureAdmin();
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { lab_id } = await params;

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();

  const labDoc = await db.collection("labs").doc(lab_id).get();
  if (!labDoc.exists) {
    return NextResponse.json({ error: "Lab not found" }, { status: 404 });
  }

  const emailClash = await db
    .collection("lab_staff")
    .where("email", "==", body.email)
    .limit(1)
    .get();
  if (!emailClash.empty) {
    return NextResponse.json(
      { error: "Email is already registered to another staff member" },
      { status: 409 },
    );
  }

  try {
    const pinHash = await bcrypt.hash(body.pin, 12);
    const ref = await db.collection("lab_staff").add({
      lab_id,
      email: body.email,
      pin_hash: pinHash,
      display_name: body.display_name,
      role: body.role,
      status: "active",
      created_at: FieldValue.serverTimestamp(),
      created_by_staff_id: check.session.staff_id,
      created_by_kind: "vendor_admin",
      last_login_at: null,
    });

    return NextResponse.json(
      {
        ok: true,
        staff: {
          staff_id: ref.id,
          email: body.email,
          display_name: body.display_name,
          role: body.role,
          status: "active",
          created_at: new Date().toISOString(),
          last_login_at: null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[admin/labs/staff POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to create staff" },
      { status: 500 },
    );
  }
}
