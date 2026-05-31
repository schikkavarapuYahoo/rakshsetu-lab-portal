export interface CountryOption {
  code: string;
  label: string;
}

export const COUNTRY_CODES: CountryOption[] = [
  { code: "+91", label: "+91 IN" },
  { code: "+1", label: "+1 US/CA" },
  { code: "+44", label: "+44 UK" },
  { code: "+971", label: "+971 AE" },
  { code: "+966", label: "+966 SA" },
  { code: "+65", label: "+65 SG" },
  { code: "+61", label: "+61 AU" },
  { code: "+49", label: "+49 DE" },
  { code: "+33", label: "+33 FR" },
  { code: "+86", label: "+86 CN" },
  { code: "+81", label: "+81 JP" },
];

export const DEFAULT_COUNTRY_CODE = "+91";

/**
 * Split a stored phone string like "+91 9949496538" into its country code and
 * local number. Falls back to DEFAULT_COUNTRY_CODE if no known prefix is found.
 */
export function parsePhoneValue(full: string): {
  countryCode: string;
  local: string;
} {
  const trimmed = (full ?? "").trim();
  const sorted = [...COUNTRY_CODES].sort(
    (a, b) => b.code.length - a.code.length,
  );
  for (const c of sorted) {
    if (trimmed.startsWith(c.code)) {
      return { countryCode: c.code, local: trimmed.slice(c.code.length).trim() };
    }
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, local: trimmed };
}

/** Re-combine a country code + local number into the canonical stored format. */
export function buildPhoneValue(countryCode: string, local: string): string {
  const cleaned = local.trim();
  return cleaned ? `${countryCode} ${cleaned}` : `${countryCode} `;
}

/**
 * Format a stored phone string for display as `+CC XXX-XXX-XXXX` (NANP-style
 * 3-3-4 grouping), regardless of country code. Examples:
 *   "+1 2702276530"   -> "+1 270-227-6530"
 *   "+91 9949496538"  -> "+91 994-949-6538"
 *   "+44 7700900123"  -> "+44 770-090-0123"
 * Numbers with fewer/more than 10 digits gracefully fall back to a similar
 * "leading 3s, trailing 4" grouping.
 */
export function formatPhone(full: string): string {
  if (!full) return "";
  const { countryCode, local } = parsePhoneValue(full);
  const digits = local.replace(/\D/g, "");
  if (!digits) return countryCode;
  return `${countryCode} ${groupDigits(digits)}`;
}

function groupDigits(digits: string): string {
  if (digits.length <= 4) return digits;
  const last4 = digits.slice(-4);
  const head = digits.slice(0, -4);
  const headGroups: string[] = [];
  for (let i = 0; i < head.length; i += 3) {
    headGroups.push(head.slice(i, i + 3));
  }
  return [...headGroups, last4].join("-");
}
