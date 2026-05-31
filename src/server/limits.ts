/**
 * Shared validation + pagination limits for API routes.
 *
 * Hardcoded numbers (max-length on a Zod string, page-size caps,
 * password minimums) were drifting across routes — staff signup
 * required 8-char passwords while change-password required 10, etc.
 * This module is the single source of truth so they stay aligned.
 *
 * Server-only by design — these power Zod schemas and Firestore
 * `.limit()` calls. The UI does not need to know about them; if a
 * client sends out-of-range input, the route rejects it.
 */

// ── String maxima ───────────────────────────────────────────────────

/** Email addresses — RFC 5321 caps at 254; we use a friendlier 120. */
export const MAX_EMAIL_LEN = 120;

/** Lab name, signatory name, hospital name, doctor name. */
export const MAX_NAME_LEN = 120;

/** Free-text fields like address, notes, reason-for-test. */
export const MAX_LONG_TEXT_LEN = 200;

/** Free-form long-form notes (e.g. report notes). */
export const MAX_NOTE_LEN = 1000;

// ── Auth ────────────────────────────────────────────────────────────

/** Minimum length for new staff passwords. */
export const MIN_PASSWORD_LEN = 10;

/** Maximum length we'll bcrypt — guards against absurdly long inputs. */
export const MAX_PASSWORD_LEN = 128;

/** Minimum length for a lab PIN. */
export const MIN_PIN_LEN = 6;

/** Maximum length for a lab PIN. */
export const MAX_PIN_LEN = 64;

// ── Pagination ──────────────────────────────────────────────────────

/** Default page size when the client omits `?limit=`. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Hard cap on `?limit=` to prevent abuse / accidental large reads. */
export const MAX_PAGE_LIMIT = 200;

/**
 * Coerce a raw `?limit=` value into a safe page size. NaN / missing
 * falls back to `DEFAULT_PAGE_LIMIT`; values outside the bounds are
 * clamped.
 */
export function clampPageLimit(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_PAGE_LIMIT) return MAX_PAGE_LIMIT;
  return n;
}
