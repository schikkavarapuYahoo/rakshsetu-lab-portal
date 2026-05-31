import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/server/firebase-admin";
import { getSession } from "@/server/auth/session";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/labs/[lab_id]/staff/[staff_id]
 *
 * Admin-side soft-delete of a lab staff member. Same last-owner
 * protection as the lab-side route — refuses to remove the only
 * active owner so the lab doesn't become unreachable.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ lab_id: string; staff_id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { lab_id, staff_id } = await params;
  const db = adminDb();
  const ref = db.collection("lab_staff").doc(staff_id);

  try {
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    const data = existing.data()!;
    if (data.lab_id !== lab_id) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    if (data.role === "owner" && data.status === "active") {
      const others = await db
        .collection("lab_staff")
        .where("lab_id", "==", lab_id)
        .where("role", "==", "owner")
        .where("status", "==", "active")
        .get();
      const otherActive = others.docs.some((d) => d.id !== staff_id);
      if (!otherActive) {
        return NextResponse.json(
          { error: "Cannot remove the only active owner — the lab would be locked out." },
          { status: 400 },
        );
      }
    }

    await ref.update({
      status: "removed",
      removed_at: FieldValue.serverTimestamp(),
      removed_by_staff_id: session.staff_id,
      removed_by_kind: "vendor_admin",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/labs/staff DELETE] failed:", err);
    return NextResponse.json(
      { error: "Failed to remove staff" },
      { status: 500 },
    );
  }
}
