/**
 * Provision a new lab in Firestore. Works against the local emulator OR
 * a real Firebase project — whichever is reachable based on the env vars
 * present.
 *
 * Usage (real Firebase prod):
 *   export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json
 *   export GCLOUD_PROJECT=rakshsetu-prod
 *   npx tsx scripts/provision-lab.ts \
 *     --name "ABC Diagnostics" \
 *     --code "MUM7K2" \
 *     --pin "secret1234" \
 *     --address "Shop 12, Andheri East, Mumbai 400069" \
 *     --phone "+919876543210" \
 *     --email "owner@abcdiag.com"
 *
 * Usage (local emulator):
 *   npm run ops:provision-lab -- --name "Lab name" --code "LAB1" --pin "1234"
 *
 * Lab codes:
 *   - 4-16 alphanumeric chars
 *   - First 3 letters often = city (MUM, BLR, HYD, DEL...)
 *   - Must be globally unique within Firestore
 *
 * PINs:
 *   - Min 6 characters (enforced server-side too)
 *   - Hashed with bcrypt (cost 12) before storage
 *   - Plain PIN never stored or logged after this script exits
 */

import bcrypt from "bcryptjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { readFileSync } from "fs";

import { MIN_PIN_LEN } from "../src/server/limits";

interface Args {
  name?: string;
  code?: string;
  pin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

function parseArgs(): Args {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--")) {
      args[argv[i]!.slice(2)] = argv[i + 1] ?? "";
      i++;
    }
  }
  return args as Args;
}

function initFirebase(): void {
  if (getApps().length > 0) return;

  // Emulator: rely on FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT being set.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-rakshsetu",
    });
    return;
  }

  // Real Firebase — try the three credential strategies in order.
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
    "No Firebase credentials found. Set FIRESTORE_EMULATOR_HOST for the emulator, " +
      "or FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH for real Firebase.",
  );
}

async function main(): Promise<void> {
  const args = parseArgs();

  for (const required of ["name", "code", "pin"] as const) {
    if (!args[required]) {
      console.error(`Missing required arg: --${required}`);
      console.error(
        'Usage: provision-lab.ts --name "..." --code "..." --pin "..." [--address ...] [--phone ...] [--email ...]',
      );
      process.exit(1);
    }
  }

  const labCode = args.code!.toUpperCase();
  if (!/^[A-Z0-9-]{4,16}$/.test(labCode)) {
    console.error("Lab code must be 4-16 chars (uppercase letters + digits + hyphen).");
    process.exit(1);
  }
  if (args.pin!.length < MIN_PIN_LEN) {
    console.error(`PIN must be at least ${MIN_PIN_LEN} characters.`);
    process.exit(1);
  }

  initFirebase();
  const db = getFirestore();

  // Refuse to create a duplicate. The login route already does a
  // uniqueness check; this is a friendlier early bail-out at provision time.
  const existing = await db
    .collection("labs")
    .where("lab_code", "==", labCode)
    .limit(1)
    .get();
  if (!existing.empty) {
    console.error(`Lab code ${labCode} is already taken.`);
    process.exit(1);
  }

  // Email is required for the first owner-staff login. Without it the
  // lab would be unreachable post-migration.
  const ownerEmail = (args.email || "").trim().toLowerCase();
  if (!ownerEmail) {
    console.error("--email is required (becomes the first owner staff's login email).");
    process.exit(1);
  }

  // No other lab_staff may already use this email (cross-tenant uniqueness).
  const emailClash = await db
    .collection("lab_staff")
    .where("email", "==", ownerEmail)
    .limit(1)
    .get();
  if (!emailClash.empty) {
    console.error(`Email ${ownerEmail} is already registered to another staff account.`);
    process.exit(1);
  }

  const pinHash = await bcrypt.hash(args.pin!, 12);

  // Match the shape `scripts/seed-emulator.ts` writes so the lab works
  // the same whether it was provisioned via this CLI or via the seed.
  const labRef = db.collection("labs").doc();
  await labRef.set({
    lab_code: labCode,
    lab_name: args.name!,
    lab_address: args.address || "",
    lab_phone: args.phone || "",
    lab_email: args.email || "",
    lab_logo_url: "",
    lab_logo_path: "",
    authorized_signatory: "",
    signatory_role: "",
    pin_hash: pinHash,
    status: "active",
    plan: "standard",
    subscription_plan: "standard",
    subscription_active: true,
    subscription_billing_cycle: "monthly",
    subscription_started_at: FieldValue.serverTimestamp(),
    // ~30-day window so the lab can submit reports without a billing
    // suspension on day one. Admin can extend or change the tier.
    subscription_expires_at: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ),
    current_period_started_at: FieldValue.serverTimestamp(),
    current_period_report_count: 0,
    current_period_overage_count: 0,
    // Counters so `POST /api/patients` and `POST /api/lab-reports` can
    // hand out monotonic codes (P10001, R10001, …) inside a transaction.
    patient_code_counter: 10000,
    report_code_counter: 10000,
    created_at: FieldValue.serverTimestamp(),
    last_login_at: null,
    last_login_ip: null,
  });

  // First owner staff entry — login email + PIN. The lab.pin_hash above
  // is kept for backwards-compat with any callers that still read it,
  // but the auth/login route now resolves staff by email.
  const ownerStaffRef = await db.collection("lab_staff").add({
    lab_id: labRef.id,
    email: ownerEmail,
    pin_hash: pinHash,
    display_name: `${args.name} Owner`,
    role: "owner",
    status: "active",
    created_at: FieldValue.serverTimestamp(),
    created_by_staff_id: null, // provisioned, not added by another staff
    last_login_at: null,
  });

  console.log("───────────────────────────────────────────────");
  console.log("✓ Lab provisioned");
  console.log("───────────────────────────────────────────────");
  console.log(`  Lab ID:    ${labRef.id}`);
  console.log(`  Code:      ${labCode}`);
  console.log(`  Name:      ${args.name}`);
  console.log(`  Owner ID:  ${ownerStaffRef.id}`);
  console.log("");
  console.log("Share with the lab owner — first login:");
  console.log(`  Email: ${ownerEmail}`);
  console.log(`  PIN:   ${args.pin}  (have them change it after first login)`);
  console.log("───────────────────────────────────────────────");
}

main().catch((err: unknown) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
