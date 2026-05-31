/**
 * Rotate a lab's PIN. For when a lab tech leaves, a PIN is suspected
 * compromised, or the lab has forgotten theirs and the admin UI is
 * unreachable. Old PIN hash is overwritten — the old PIN stops working
 * immediately.
 *
 * Usage:
 *   npx tsx scripts/rotate-pin.ts --code "MUM7K2" --pin "newSecret1234"
 *
 * Or via npm:
 *   npm run ops:rotate-pin -- --code "MUM7K2" --pin "newSecret1234"
 *
 * Works against the local emulator OR a real Firebase project — same
 * env-var rules as `provision-lab.ts`.
 */

import bcrypt from "bcryptjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

import { MIN_PIN_LEN } from "../src/server/limits";

interface Args {
  code?: string;
  pin?: string;
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
    "No Firebase credentials found. Set FIRESTORE_EMULATOR_HOST for the emulator, " +
      "or FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH for real Firebase.",
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.code || !args.pin) {
    console.error('Usage: rotate-pin.ts --code "MUM7K2" --pin "newPIN"');
    process.exit(1);
  }
  if (args.pin.length < MIN_PIN_LEN) {
    console.error(`PIN must be at least ${MIN_PIN_LEN} characters.`);
    process.exit(1);
  }

  initFirebase();
  const db = getFirestore();

  const code = args.code.toUpperCase();
  const snap = await db
    .collection("labs")
    .where("lab_code", "==", code)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error(`Lab ${code} not found.`);
    process.exit(1);
  }

  const pinHash = await bcrypt.hash(args.pin, 12);
  await snap.docs[0]!.ref.update({
    pin_hash: pinHash,
    // Stamp the rotation so it shows up in the audit trail (and so
    // a future admin UI can warn if rotations are happening too often).
    pin_rotated_at: FieldValue.serverTimestamp(),
  });

  console.log(`✓ PIN rotated for ${code}.`);
  console.log("  Old PIN no longer works. Share the new one with the lab securely.");
}

main().catch((err: unknown) => {
  console.error("Rotation failed:", err);
  process.exit(1);
});
