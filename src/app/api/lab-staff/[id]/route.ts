import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { requireLabSession } from "@/server/auth/session";
import { MAX_NAME_LEN, MAX_PIN_LEN, MIN_PIN_LEN } from "@/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/lab-staff/[id]
 *
 * Owner-only. Update an existing staff member belonging to this lab.
 * Editable: display_name, role, status, pin (optional — only updated
 * when set).
 *
 * Refuses to:
 *   - demote the only owner (would lock the lab out)
 *   - change a staff in a different lab (404 — looks like not found)
 */
const PatchStaffSchema = z.object({
  display_name: z.string().min(1).max(MAX_NAME_LEN).optional(),
  role: z.enum(["owner", "admin", "technician"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  /** Optional PIN reset. Send only when the owner wants to change it. */
  pin: z.string().min(MIN_PIN_LEN).max(MAX_PIN_LEN).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.staff_role !== "owner") {
    return NextResponse.json(
      { error: "Only the lab owner can edit staff" },
      { status: 403 },
    );
  }

  const { id } = await params;
  let body: z.infer<typeof PatchStaffSchema>;
  try {
    body = PatchStaffSchema.parse(await req.json());
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return NextResponse.json({ error: "Invalid input", issues }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.collection("lab_staff").doc(id);

  try {
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    const data = existing.data()!;
    // Lab-scope guard — looks like 404 to prevent cross-tenant enumeration.
    if (data.lab_id !== session.lab_id) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Last-owner-protection: refuse a change that would leave the lab
    // without any active owner. This prevents a "no one can log in"
    // foot-gun if the only owner demotes or suspends themselves.
    const wasOwner = data.role === "owner" && data.status === "active";
    const willNoLongerBeOwner =
      (body.role !== undefined && body.role !== "owner") ||
      (body.status !== undefined && body.status !== "active");
    if (wasOwner && willNoLongerBeOwner) {
      const otherOwners = await db
        .collection("lab_staff")
        .where("lab_id", "==", session.lab_id)
        .where("role", "==", "owner")
        .where("status", "==", "active")
        .get();
      const otherActiveOwnerExists = otherOwners.docs.some((d) => d.id !== id);
      if (!otherActiveOwnerExists) {
        return NextResponse.json(
          {
            error:
              "Cannot demote or suspend the only active owner. Promote another active owner first.",
          },
          { status: 400 },
        );
      }
    }

    const update: Record<string, unknown> = {
      updated_at: FieldValue.serverTimestamp(),
    };
    if (body.display_name !== undefined) update.display_name = body.display_name;
    if (body.role !== undefined) update.role = body.role;
    if (body.status !== undefined) update.status = body.status;
    if (body.pin) {
      update.pin_hash = await bcrypt.hash(body.pin, 12);
      update.pin_rotated_at = FieldValue.serverTimestamp();
    }

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/lab-staff PATCH] failed:", err);
    return NextResponse.json(
      { error: "Failed to update staff" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/lab-staff/[id]
 *
 * Owner-only. Soft-delete: flips status to "removed" so the staff
 * row stays for the audit trail but cannot log in. Same last-owner
 * protection as PATCH.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.staff_role !== "owner") {
    return NextResponse.json(
      { error: "Only the lab owner can remove staff" },
      { status: 403 },
    );
  }
  if (session.staff_id === (await params).id) {
    return NextResponse.json(
      { error: "Cannot remove yourself. Ask another owner." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const db = adminDb();
  const ref = db.collection("lab_staff").doc(id);

  try {
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    const data = existing.data()!;
    if (data.lab_id !== session.lab_id) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (data.role === "owner") {
      const others = await db
        .collection("lab_staff")
        .where("lab_id", "==", session.lab_id)
        .where("role", "==", "owner")
        .where("status", "==", "active")
        .get();
      const otherActive = others.docs.some((d) => d.id !== id);
      if (!otherActive) {
        return NextResponse.json(
          { error: "Cannot remove the only active owner." },
          { status: 400 },
        );
      }
    }

    await ref.update({
      status: "removed",
      removed_at: FieldValue.serverTimestamp(),
      removed_by_staff_id: session.staff_id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/lab-staff DELETE] failed:", err);
    return NextResponse.json(
      { error: "Failed to remove staff" },
      { status: 500 },
    );
  }
}
