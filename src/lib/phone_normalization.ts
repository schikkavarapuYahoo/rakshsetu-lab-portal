/**
 * E.164 phone-number normalization for the lab portal.
 *
 * The lab portal is the entry point where lab staff type phone numbers
 * by hand. They will type chaos. This module owns the canonicalization
 * step that produces the strict E.164 format we store + use as the
 * Firebase Auth phone-number lookup key.
 *
 * Invariants:
 *   - Output always starts with `+` and contains only digits after.
 *   - Length is 11..16 (a country code of 1-3 digits plus 10-13 digit
 *     subscriber number; per E.164 the total cannot exceed 15 digits
 *     plus the leading `+`).
 *   - Throws when the input cannot be confidently mapped to E.164.
 *     The throw is preferred over a silent best-effort because a
 *     wrong number is worse than a rejected submission — wrong
 *     numbers attach reports to the wrong user.
 *
 * Default country: India (+91). RakshSetu is India-first; lab staff
 * who type a 10-digit number without a country code mean +91.
 *
 * Edge cases the tests below exercise:
 *   - 10 digits, no country code  → +91 prepended
 *   - 11 digits with leading 0    → leading 0 stripped, +91 prepended
 *     (Indian landlines + some forms of mobile dialing include the
 *     trunk prefix 0; we strip it because Firebase Auth is in E.164)
 *   - 11 digits starting with 1   → +1 (US/Canada)
 *   - 12 digits starting with 91  → +91 (already had country code,
 *     just missing the +)
 *   - International with spaces/dashes/parens → digits stripped, +
 *     preserved
 *   - Anything < 10 digits or > 15 → throw
 */

/**
 * Normalize a phone number string to E.164.
 * @throws Error if the input cannot be normalized.
 */
export function normalizePhone(rawInput: string): string {
  if (typeof rawInput !== 'string') {
    throw new Error('Phone number must be a string.');
  }
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    throw new Error('Phone number is empty.');
  }

  // Path 1: input already starts with `+`. Strip everything except
  // digits after the `+`. Length-check; pass through.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new Error(
        `Invalid phone number length after country code (${digits.length} digits).`,
      );
    }
    return `+${digits}`;
  }

  // Path 2: no `+`. Strip non-digits and apply heuristics.
  const digits = trimmed.replace(/\D/g, '');

  // Indian trunk prefix: 11 digits beginning with 0 is the user typing
  // their domestic number with the trunk prefix. Drop the 0, treat
  // the rest as a 10-digit Indian mobile number.
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    // 10 digits, no country code → default to India per RakshSetu's
    // pilot market.
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    // US/Canada national + country code.
    return `+${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    // Indian number with 91 already prefixed but missing +.
    return `+${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    // Other international without leading +. Prepend +.
    return `+${digits}`;
  }

  throw new Error(
    `Invalid phone number length (${digits.length} digits). ` +
      `Expected 10 (Indian mobile) or 10-15 with country code.`,
  );
}
