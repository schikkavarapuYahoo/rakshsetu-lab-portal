/**
 * Wipe demo / test data from the local Firebase emulator so you can
 * start entering real data from a clean slate.
 *
 * What stays:
 *   - labs/{demo-lab-001}  (RAKSHDEMO, pin=1234) — login still works
 *   - staff/{admin-001}    (admin@rakshsetu.com, pw=admin1234)
 *
 * What gets wiped:
 *   - users/             (all patient docs)
 *   - lab_reports/       (all reports)
 *   - lab_report_batches/ (visit summaries)
 *   - credit_ledger/, payments/, subscription_history/, ...
 *   - any legacy zustand-shape collections from earlier seeds
 *
 * Run with:
 *   npm run emu:wipe
 *
 * After running, ALSO clear browser localStorage (DevTools →
 * Application → Local Storage → http://localhost:3000 → Clear all) so
 * the zustand stores don't repopulate the UI from their cached state.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST is not set. Refusing to run — this script\n" +
      "is for the local emulator only. Use `npm run emu:wipe` instead.",
  );
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT || "demo-rakshsetu";
if (getApps().length === 0) {
  initializeApp({ projectId });
}

// Collections that hold demo / accumulated data. Order doesn't matter
// — Firestore has no relational FK constraints. Anything that doesn't
// exist yet is a no-op.
const WIPE_COLLECTIONS = [
  // Source schema
  "users",
  "lab_reports",
  "lab_report_batches",
  "credit_ledger",
  "payments",
  "subscription_history",
  "billing_status_history",
  "lab_pricing_history",
  "test_pricing",
  "linked_labs",
  "lab_audit_logs",
  "staff_audit_logs",
  "draft_batches",
  // Legacy zustand-shape collections (in case earlier seeds left them)
  "patients",
  "reports",
  "lab_tests",
];

async function wipeCollection(db: Firestore, name: string): Promise<number> {
  const snap = await db.collection(name).get();
  if (snap.empty) return 0;

  let batch = db.batch();
  const commits: Promise<unknown>[] = [];
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    // Firestore batched writes cap at 500 operations.
    if (count % 400 === 0) {
      commits.push(batch.commit());
      batch = db.batch();
    }
  }
  commits.push(batch.commit());
  await Promise.all(commits);
  return snap.size;
}

async function main(): Promise<void> {
  console.log(`Wiping data on ${process.env.FIRESTORE_EMULATOR_HOST}…\n`);
  const db = getFirestore();

  let total = 0;
  for (const name of WIPE_COLLECTIONS) {
    const n = await wipeCollection(db, name);
    if (n > 0) {
      console.log(`  ✓ ${name}: deleted ${n}`);
      total += n;
    }
  }

  if (total === 0) {
    console.log("  Nothing to delete — already clean.\n");
  } else {
    console.log(`\nDeleted ${total} docs.\n`);
  }

  console.log("Kept:");
  console.log("  labs/demo-lab-001  (lab_code=RAKSHDEMO, pin=1234)");
  console.log("  staff/admin-001    (admin@rakshsetu.com, pw=admin1234)\n");

  console.log("Next: clear browser localStorage too, otherwise the");
  console.log("zustand stores will hydrate with their seeded demo data.");
  console.log("DevTools → Application → Local Storage → Clear all.");
}

main().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
