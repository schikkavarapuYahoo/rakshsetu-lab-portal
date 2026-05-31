import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import {
  MAX_EMAIL_LEN,
  MAX_NAME_LEN,
  MAX_PIN_LEN,
  MIN_PIN_LEN,
} from "@/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab-staff
 *
 * List every staff member belonging to the current lab. Returns the
 * safe-to-display fields only (NEVER the pin_hash). All staff in the
 * lab can see the roster — only owners can mutate it.
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb()
      .collection("lab_staff")
      .where("lab_id", "==", session.lab_id)
      .get();

    const staff = snap.docs.map((d) => {
      const data = d.data();
      return {
        staff_id: d.id,
        email: data.email,
        username: (data.username as string | undefined) || null,
        display_name: data.display_name || data.email,
        role: data.role,
        status: data.status,
        created_at: data.created_at?.toDate?.()?.toISOString() ?? null,
        last_login_at: data.last_login_at?.toDate?.()?.toISOString() ?? null,
      };
    });

    // Owner first, then admin, then technician, then alphabetical within
    // each — owners are the people most likely to be searched for first.
    const roleOrder: Record<string, number> = {
      owner: 0,
      admin: 1,
      technician: 2,
    };
    staff.sort((a, b) => {
      const ra = roleOrder[a.role] ?? 99;
      const rb = roleOrder[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.display_name.localeCompare(b.display_name);
    });

    return NextResponse.json({ staff });
  } catch (err) {
    console.error("[api/lab-staff GET] failed:", err);
    return NextResponse.json(
      { error: "Failed to load staff" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/lab-staff
 *
 * Owner-only. Add a new staff member to this lab. Validates email
 * uniqueness across the whole platform (every staff email is a global
 * login identifier — two labs can't have the same staff email).
 */
// Usernames: 3-32 chars, lowercase letters, digits, dot, underscore,
// hyphen. Globally unique across all labs (acts as a login identifier
// alongside email).
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

const CreateStaffSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LEN).toLowerCase(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, "Username must be 3-32 lowercase letters, digits, dot, underscore or hyphen")
    .optional()
    .or(z.literal("")),
  display_name: z.string().min(1).max(MAX_NAME_LEN).trim(),
  role: z.enum(["owner", "admin", "technician"]),
  pin: z.string().min(MIN_PIN_LEN).max(MAX_PIN_LEN),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.staff_role !== "owner") {
    return NextResponse.json(
      { error: "Only the lab owner can add staff" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof CreateStaffSchema>;
  try {
    body = CreateStaffSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  const username = body.username && body.username.length > 0 ? body.username : null;

  // Cross-platform email uniqueness.
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
  // Cross-platform username uniqueness (only when one is set).
  if (username) {
    const usernameClash = await db
      .collection("lab_staff")
      .where("username", "==", username)
      .limit(1)
      .get();
    if (!usernameClash.empty) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 },
      );
    }
  }

  try {
    const pinHash = await bcrypt.hash(body.pin, 12);
    const ref = await db.collection("lab_staff").add({
      lab_id: session.lab_id,
      email: body.email,
      username,
      pin_hash: pinHash,
      display_name: body.display_name,
      role: body.role,
      status: "active",
      created_at: FieldValue.serverTimestamp(),
      created_by_staff_id: session.staff_id,
      last_login_at: null,
    });

    return NextResponse.json(
      {
        ok: true,
        staff: {
          staff_id: ref.id,
          email: body.email,
          username,
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
    console.error("[api/lab-staff POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to create staff" },
      { status: 500 },
    );
  }
}
