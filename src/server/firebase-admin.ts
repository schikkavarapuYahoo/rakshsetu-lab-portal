import 'server-only';

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';

/**
 * Firebase Admin SDK singleton. Used in Next.js API routes for
 * privileged operations (writing reports, validating sessions).
 *
 * Two runtime modes:
 *
 *   1. EMULATOR (local dev) — when FIRESTORE_EMULATOR_HOST is set, the
 *      admin SDK auto-routes every call to the local emulator (docker
 *      compose up). No service account JSON required; we initialize
 *      with a fake project ID. Data lives in `.emu-data/` and survives
 *      container restarts.
 *
 *   2. PRODUCTION — real Firebase project. Credentials come from one of
 *      the three env vars below (checked in order):
 *        FIREBASE_SERVICE_ACCOUNT_JSON   — inline JSON (best for Vercel)
 *        FIREBASE_SERVICE_ACCOUNT_PATH   — absolute path to JSON file
 *        GOOGLE_APPLICATION_CREDENTIALS  — Google standard env var
 *
 * This file is ONLY imported from server-side code (API routes, server
 * components, middleware). Never imported from "use client" components —
 * doing so would leak credentials to the browser.
 */

let app: App | undefined;

/** True when any of the Firebase emulator env vars is set. */
function isEmulatorMode(): boolean {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  );
}

function getServiceAccount() {
  // 1. Inline JSON
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim().length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
          'Make sure the entire service account JSON is on one line in your env.',
      );
    }
  }

  // 2. File path (custom env var)
  const customPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (customPath && customPath.trim().length > 0) {
    try {
      return JSON.parse(readFileSync(customPath, 'utf8'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Could not read service account from FIREBASE_SERVICE_ACCOUNT_PATH=${customPath}: ${message}`,
      );
    }
  }

  // 3. Standard Google env var
  const stdPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (stdPath && stdPath.trim().length > 0) {
    try {
      return JSON.parse(readFileSync(stdPath, 'utf8'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Could not read service account from GOOGLE_APPLICATION_CREDENTIALS=${stdPath}: ${message}`,
      );
    }
  }

  throw new Error(
    'No Firebase service account credentials found. Set ONE of:\n' +
      '  FIREBASE_SERVICE_ACCOUNT_JSON  (inline JSON, recommended for Vercel)\n' +
      '  FIREBASE_SERVICE_ACCOUNT_PATH  (absolute path to JSON file)\n' +
      '  GOOGLE_APPLICATION_CREDENTIALS (absolute path to JSON file, Google standard)\n' +
      '\n…or run the local emulator (`npm run emu:up`) to skip credentials entirely.',
  );
}

function getAdminApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  if (isEmulatorMode()) {
    // Emulator mode — no real credentials. The admin SDK reads
    // FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST /
    // FIREBASE_STORAGE_EMULATOR_HOST and routes everything to the
    // local emulator. The projectId still has to be set so doc paths
    // resolve; we use the same `demo-rakshsetu` ID as firebase.json.
    const projectId =
      process.env.GCLOUD_PROJECT ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      'demo-rakshsetu';
    app = initializeApp({
      projectId,
      storageBucket: `${projectId}.appspot.com`,
    });
    return app;
  }

  // Production: real service account.
  const serviceAccount = getServiceAccount();
  // Default storage bucket — derive from project_id if not explicitly set.
  // Firebase projects use one of two bucket suffixes depending on age:
  //   - newer projects: {project_id}.firebasestorage.app
  //   - older projects: {project_id}.appspot.com
  // Set FIREBASE_STORAGE_BUCKET in env to override.
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${serviceAccount.project_id}.firebasestorage.app`;

  app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: bucketName,
  });
  return app;
}

// Firestore `.settings()` can only be applied once per process, before
// any other operation runs. In Next.js dev mode, route handler modules
// re-import on hot reload while the underlying Firestore client keeps
// its initialised state — so a naive "first caller sets settings"
// flag breaks across reloads. We stash a sentinel on globalThis so the
// init happens at most once per process, hot-reload-safe.
type GlobalWithFirestoreFlag = typeof globalThis & {
  __rakshsetuFirestoreConfigured?: boolean;
};

export const adminDb = () => {
  const db = getFirestore(getAdminApp());
  const g = globalThis as GlobalWithFirestoreFlag;
  if (!g.__rakshsetuFirestoreConfigured) {
    try {
      // `ignoreUndefinedProperties` lets routes send partial payloads
      // (e.g. a Report with no `referringHospital` yet) without
      // hand-stripping undefined keys at every call site.
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Another caller raced us to settings() — treat as success.
    }
    g.__rakshsetuFirestoreConfigured = true;
  }
  return db;
};

export const adminAuth = () => getAuth(getAdminApp());
export const adminStorage = () => getStorage(getAdminApp());

/** Exposed for tests / seed scripts that want to short-circuit setup. */
export const __isEmulatorMode = isEmulatorMode;
