/**
 * Heuristic auto-flagging of a result value against the parameter's
 * reference range. Used in the result-entry UI so the technician doesn't
 * have to manually pick Low / Normal / High for each row.
 *
 * Supported reference-range patterns (covers ~90% of seeded ranges):
 *
 *   "< 200"            → upper bound only. High if value > 200.
 *   "> 40"             → lower bound only. Low if value < 40.
 *   "13.0 - 17.0"      → numeric range. Low if <, High if >, Normal in.
 *   "0.4 - 4.0"        → same.
 *   "Negative"         → categorical "should be". Anything else → High.
 *   "Non-reactive"     → same.
 *   "Not seen" / "No growth" → same.
 *
 * Anything we don't recognise (e.g. age/gender-variant strings like
 * "13–17 (male), 12–15 (female)") returns `undefined` — the technician
 * keeps full control of the flag in those cases.
 *
 * Critical thresholds (PRD §6.2) are intentionally NOT computed here.
 * They need a separate per-parameter threshold field on the catalog;
 * for now the technician escalates to Critical manually.
 */
export type AutoFlag = "Low" | "Normal" | "High";

const CATEGORICAL_EXPECTED = new Set([
  "negative",
  "non-reactive",
  "non reactive",
  "nonreactive",
  "not seen",
  "no growth",
  "absent",
  "nil",
]);

export function flagForValue(
  rawValue: string,
  rangeString: string | undefined,
): AutoFlag | undefined {
  const value = rawValue.trim();
  if (!value || !rangeString) return undefined;

  const range = rangeString.trim();
  const numValue = Number(value);

  if (Number.isFinite(numValue)) {
    // "< 200" or "<200" — upper-bound-only normal range
    const lt = range.match(/^<\s*([\d.]+)\s*$/);
    if (lt) {
      const upper = Number(lt[1]);
      if (!Number.isFinite(upper)) return undefined;
      return numValue > upper ? "High" : "Normal";
    }
    // "> 40" — lower-bound-only normal range
    const gt = range.match(/^>\s*([\d.]+)\s*$/);
    if (gt) {
      const lower = Number(gt[1]);
      if (!Number.isFinite(lower)) return undefined;
      return numValue < lower ? "Low" : "Normal";
    }
    // "13.0 - 17.0", "13-17", "1.005 - 1.030" — closed range
    // The dash accepts hyphen, en-dash, or em-dash for forgiveness.
    const rng = range.match(/^([\d.]+)\s*[-–—]\s*([\d.]+)\s*$/);
    if (rng) {
      const lo = Number(rng[1]);
      const hi = Number(rng[2]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi)
        return undefined;
      if (numValue < lo) return "Low";
      if (numValue > hi) return "High";
      return "Normal";
    }
    // Numeric value but unparseable range → leave alone.
    return undefined;
  }

  // Non-numeric value (e.g. "Positive", "Reactive", "Trace").
  // Compare against well-known "should be X" categorical ranges.
  const normalisedRange = range.toLowerCase();
  if (CATEGORICAL_EXPECTED.has(normalisedRange)) {
    const normalisedValue = value.toLowerCase();
    return normalisedValue === normalisedRange ||
      // common synonyms for "negative-equivalent"
      (normalisedRange === "negative" &&
        (normalisedValue === "nil" || normalisedValue === "absent"))
      ? "Normal"
      : "High";
  }

  return undefined;
}
