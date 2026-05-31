/**
 * Create an admin staff account in the RakshSetu admin console.
 *
 * Use this to bootstrap the first internal user who can log into
 * /staff-login and manage labs from the admin UI. After this you can
 * create more staff (rep / admin) from the admin UI itself.
 *
 * Usage (real Firebase):
 *   export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json
 *   export GCLOUD_PROJECT=rakshsetu-labs-dev
 *   npx tsx scripts/create-admin.ts \
 *     --email "you@rakshsetu.com" \
 *     --password "ChooseAStrongPassword" \
 *     --name "Your Name"
 *
 * Or via npm shortcut: npm run ops:create-admin -- --email ... --password ... --name ...
 *
 * Refuses to create a duplicate (same email already in use).
 */

import bcrypt from "bcryptjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { readFileSync } from "fs";

import { MIN_PASSWORD_LEN } from "../src/server/limits";

interface Args {
  email?: string;
  password?: string;
  name?: string;
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

  if (!args.email || !args.password || !args.name) {
    console.error("Usage: create-admin.ts --email <e> --password <p> --name <n>");
    process.exit(1);
  }
  if (args.password.length < MIN_PASSWORD_LEN) {
    console.error(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    process.exit(1);
  }
  if (!/^[\w.+-]+@[\w.-]+\.\w+$/.test(args.email)) {
    console.error("Invalid email format.");
    process.exit(1);
  }

  initFirebase();
  const db = getFirestore();
  const email = args.email.toLowerCase();

  const existing = await db
    .collection("staff")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existing.empty) {
    console.error(`Email ${email} is already in use.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(args.password, 12);
  const ref = db.collection("staff").doc();
  await ref.set({
    email,
    password_hash: passwordHash,
    display_name: args.name,
    role: "admin",
    territory: "",
    phone: "",
    status: "active",
    labs_owned_count: 0,
    created_at: FieldValue.serverTimestamp(),
    last_login_at: null,
  });

  console.log("───────────────────────────────────────────────");
  console.log("✓ Admin account created");
  console.log("───────────────────────────────────────────────");
  console.log(`  Staff ID: ${ref.id}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Name:     ${args.name}`);
  console.log("");
  console.log("Save the password securely — only the bcrypt hash is stored.");
  console.log("Login at: <your-vercel-url>/staff-login");
  console.log("───────────────────────────────────────────────");
}

main().catch((err: unknown) => {
  console.error("Failed:", err);
  process.exit(1);
});
