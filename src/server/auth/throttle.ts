import 'server-only';

/**
 * Firestore-backed login throttle. Replaces the in-memory `Map`-based
 * throttle which is broken on Vercel because each cold start creates a
 * fresh JavaScript heap. With multiple instances behind a load balancer,
 * an attacker can distribute attempts and bypass per-instance limits.
 *
 * This implementation uses a Firestore transaction to atomically increment
 * the failure counter, so it works correctly across any number of serverless
 * function instances. Cost: 2 reads + 1 write per failed login. We accept
 * this cost because login is a rare event compared to read-heavy app usage.
 *
 * Storage: collection `login_throttle/{key}` where `key` is something like
 * `lab:TEST01` or `staff:user@example.com`. Each doc holds:
 *   - count        : current attempt count in the window
 *   - first_at     : when the window started (ms since epoch)
 *   - locked_until : if set and in the future, lockout is active
 */

import { adminDb } from '@/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '15', 10);
const WINDOW_MS = LOCKOUT_MINUTES * 60 * 1000;

const COLLECTION = 'login_throttle';

/**
 * Returns `{ allowed: true }` if the request may proceed, or
 * `{ allowed: false, retryAfterSeconds }` if currently locked out.
 *
 * Call BEFORE the credential check, but AFTER input validation. If
 * Firestore is unavailable, we fail OPEN (allow the attempt). This is
 * a deliberate trade-off: if Firestore is down, blocking everyone is
 * worse for UX than potentially weakening rate-limiting for a few minutes.
 */
export async function checkAttempt(
  key: string,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  try {
    const now = Date.now();
    const ref = adminDb().collection(COLLECTION).doc(safeKey(key));
    const snap = await ref.get();

    if (!snap.exists) return { allowed: true };
    const data = snap.data()!;

    // Currently locked out
    if (data.locked_until && data.locked_until > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((data.locked_until - now) / 1000),
      };
    }

    // Expired lock — reset
    if (data.locked_until && data.locked_until <= now) {
      await ref.delete().catch(() => {});
      return { allowed: true };
    }

    // Window expired without hitting limit — reset
    if (data.first_at && data.first_at + WINDOW_MS < now) {
      await ref.delete().catch(() => {});
      return { allowed: true };
    }

    return { allowed: true };
  } catch (e) {
    // Fail-open. See module comment for rationale.
    console.warn('[throttle] checkAttempt failed:', e);
    return { allowed: true };
  }
}

/**
 * Record a failed attempt. Atomically increments via a transaction so
 * concurrent failed attempts don't race.
 */
export async function recordFailedAttempt(key: string): Promise<void> {
  try {
    const now = Date.now();
    const ref = adminDb().collection(COLLECTION).doc(safeKey(key));
    await adminDb().runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists) {
        txn.set(ref, {
          count: 1,
          first_at: now,
          locked_until: null,
          updated_at: FieldValue.serverTimestamp(),
        });
        return;
      }
      const data = snap.data()!;
      // Window expired — start fresh
      if (data.first_at && data.first_at + WINDOW_MS < now) {
        txn.set(ref, {
          count: 1,
          first_at: now,
          locked_until: null,
          updated_at: FieldValue.serverTimestamp(),
        });
        return;
      }
      const newCount = (data.count || 0) + 1;
      const update: Record<string, unknown> = {
        count: newCount,
        updated_at: FieldValue.serverTimestamp(),
      };
      if (newCount >= MAX_ATTEMPTS) {
        update.locked_until = now + WINDOW_MS;
      }
      txn.update(ref, update);
    });
  } catch (e) {
    console.warn('[throttle] recordFailedAttempt failed:', e);
  }
}

/** Clear the counter after a successful login. */
export async function clearAttempts(key: string): Promise<void> {
  try {
    await adminDb().collection(COLLECTION).doc(safeKey(key)).delete();
  } catch {
    // Ignore — not finding a record is not an error
  }
}

/**
 * Sanitize a key into a valid Firestore document ID. Document IDs cannot
 * contain `/` or be longer than 1500 bytes; in practice we'll never see
 * either, but the substring + replace is defensive.
 */
function safeKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._@:-]/g, '_').slice(0, 200);
}
