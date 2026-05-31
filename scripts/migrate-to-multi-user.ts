/**
 * Migration: lab-level PIN → per-staff PINs (May 2026 multi-user rollout).
 *
 * Before this migration:
 *   labs/{labId}.pin_hash    ← single PIN per lab
 *
 * After:
 *   lab_staff/{staffId}      ← top-level, one doc per user
 *     lab_id                 ← back-reference to the lab they belong to
 *     email
 *     pin_hash               ← bcrypt-hashed PIN
 *     display_name
 *     role: "owner" | "admin" | "technician"
 *     status: "active" | "suspended"
 *
 * For every existing lab, this script creates ONE owner staff entry:
 *   - email: lab.lab_email if set, else a generated placeholder
 *   - pin_hash: copied verbatim from lab.pin_hash (no PIN change for user)
 *   - role: "owner"
 *   - display_name: lab.lab_name + " Owner" (editable later)
 *
 * Idempotent: if a lab already has an owner staff entry, it skips that lab.
 *
 * Usage (real Firebase):
 *   export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/sa.json
 *   export GCLOUD_PROJECT=rakshsetu-labs-dev
 *   npx tsx scripts/migrate-to-multi-user.ts [--dry-run]
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

function initFirebase(): void {
  if (getApps().length > 0) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-rakshsetu",
    });
    return;
  }
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim()) {
    initializeApp({ credential: cert(JSON.parse(inlineJson)) });
    return;
  }
  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && path.trim()) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(path, "utf8"))) });
    return;
  }
  throw new Error(
    "No Firebase credentials. Set FIRESTORE_EMULATOR_HOST or FIREBASE_SERVICE_ACCOUNT_PATH / _JSON.",
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  initFirebase();
  const db = getFirestore();

  console.log(`Multi-user migration ${dryRun ? "(DRY RUN — no writes)" : ""}\n`);

  const labsSnap = await db.collection("labs").get();
  console.log(`Found ${labsSnap.size} labs.\n`);

  let created = 0;
  let skipped = 0;
  let errored = 0;

  for (const labDoc of labsSnap.docs) {
    const lab = labDoc.data();
    const labId = labDoc.id;
    const labName = (lab.lab_name as string) || "(unnamed)";
    const labCode = (lab.lab_code as string) || "(no code)";

    // Skip if this lab already has at least one staff member.
    const existingStaff = await db
      .collection("lab_staff")
      .where("lab_id", "==", labId)
      .limit(1)
      .get();
    if (!existingStaff.empty) {
      console.log(`  · ${labCode} (${labName}) — already has staff, skipping`);
      skipped++;
      continue;
    }

    const pinHash = lab.pin_hash as string | undefined;
    if (!pinHash) {
      console.log(`  ⚠ ${labCode} (${labName}) — no pin_hash on lab doc, skipping`);
      errored++;
      continue;
    }

    const email = (lab.lab_email as string)?.trim().toLowerCase();
    if (!email) {
      console.log(
        `  ⚠ ${labCode} (${labName}) — no lab_email; can't migrate without an email. Set lab.lab_email manually and re-run, OR delete and re-provision via ops:provision-lab.`,
      );
      errored++;
      continue;
    }

    // Check that no other staff already uses this email (cross-lab uniqueness).
    const emailClash = await db
      .collection("lab_staff")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!emailClash.empty) {
      console.log(`  ⚠ ${labCode} (${labName}) — email ${email} already in use by another staff, skipping`);
      errored++;
      continue;
    }

    if (dryRun) {
      console.log(`  ✓ would create: ${labCode} (${labName}) → ${email} (role=owner)`);
      created++;
      continue;
    }

    await db.collection("lab_staff").add({
      lab_id: labId,
      email,
      pin_hash: pinHash,
      display_name: `${labName} Owner`,
      role: "owner",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
      created_by_staff_id: null, // migrated, not created by another staff
      last_login_at: null,
    });
    console.log(`  ✓ ${labCode} (${labName}) → ${email} (role=owner)`);
    created++;
  }

  console.log("\n───────────────────────────────────────────────");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errored: ${errored}`);
  if (dryRun) console.log("(dry run — no actual writes)");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
