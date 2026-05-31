import type { Report } from "@/lib/stores/reports";

/**
 * Verified blood group lookup, with provenance.
 *
 * "Verified" here means a value taken from a real BG-RH (Blood Group +
 * Rh Typing) test performed by this lab — never self-reported. Printing
 * an unverified blood group on a signed lab report is a medico-legal
 * landmine, so we only return a result when an actual BG-RH report
 * exists for the patient.
 *
 * Order of preference:
 *   1. The current report itself, if it is the BG-RH test (already
 *      reviewed or published — drafts don't count).
 *   2. Any other Published BG-RH report for the same patient at this lab,
 *      most recent first.
 *
 * Returns `null` when no usable BG-RH result exists yet. Display format
 * is the standard "{ABO}{Rh sign}" — e.g. "O+", "AB-", "B+".
 */
export interface BloodGroupResult {
  /** Display string, e.g. "O+", "AB-". */
  display: string;
  /** Report code the value was derived from, e.g. "R20260015". */
  sourceReportCode: string;
  /** ISO timestamp of the source report (published-at, then collected-at). */
  sourceAt: string;
  /** True when the source report is the same report being printed. */
  isCurrentReport: boolean;
}

export function deriveBloodGroup(
  reports: Report[],
  patientId: string,
  currentReportId: string,
): BloodGroupResult | null {
  const candidates = reports.filter((r) => {
    if (r.patientId !== patientId) return false;
    if ((r.testCode ?? "").toUpperCase() !== "BG-RH") return false;
    // The current report itself counts if it's at least in Review (so
    // results exist); other patient reports must be Published.
    if (r.id === currentReportId) {
      return r.status === "Review" || r.status === "Published";
    }
    return r.status === "Published";
  });

  candidates.sort((a, b) => {
    const aTime = a.publishedAt ?? a.collectedAt ?? a.createdAt;
    const bTime = b.publishedAt ?? b.collectedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });

  for (const r of candidates) {
    const parsed = extractBloodGroup(r);
    if (parsed) {
      return {
        display: parsed,
        sourceReportCode: r.reportCode,
        sourceAt: r.publishedAt ?? r.collectedAt ?? r.createdAt,
        isCurrentReport: r.id === currentReportId,
      };
    }
  }

  return null;
}

/** Pull "O+" out of a BG-RH report's two result rows. Returns null if
 *  the ABO row is missing or unparseable. Rh is best-effort — if the
 *  Rh row is missing we still return the ABO letter on its own. */
function extractBloodGroup(report: Report): string | null {
  const aboRaw = findRow(report, /\b(abo|group)\b/i);
  if (!aboRaw) return null;

  const abo = normalizeAbo(aboRaw);
  if (!abo) return null;

  const rhRaw = findRow(report, /\brh\b|typing/i);
  const rh = rhRaw ? normalizeRh(rhRaw) : "";
  return abo + rh;
}

function findRow(report: Report, paramPattern: RegExp): string | null {
  const row = report.results.find((r) => paramPattern.test(r.parameter));
  const v = row?.value?.trim();
  return v ? v : null;
}

/** Pick out A / B / AB / O from a noisy free-text value. */
function normalizeAbo(raw: string): string | null {
  const t = raw.toUpperCase().trim();
  // Greedy: "AB" before "A" or "B"
  if (/\bAB\b/.test(t)) return "AB";
  if (/\bA\b/.test(t)) return "A";
  if (/\bB\b/.test(t)) return "B";
  if (/\bO\b/.test(t) || t === "0") return "O";
  return null;
}

/** Convert "Positive" / "Negative" / "+" / "-" to "+" or "-". */
function normalizeRh(raw: string): string {
  const t = raw.toLowerCase().trim();
  if (t.includes("pos") || t.includes("+")) return "+";
  if (t.includes("neg") || t.includes("-")) return "-";
  return "";
}
