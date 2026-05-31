/**
 * Industrial-standard qualitative result schemas, keyed by reference
 * range string. When a parameter's range matches one of these, the
 * result-entry UI renders a dropdown of the canonical values instead
 * of a free-text input, so the technician can't typo "Reactive" as
 * "Reactvie" or "1+" as "1+ " (trailing space breaks the auto-flag).
 *
 * Source references:
 *   - Urinalysis dipstick semi-quantitative: CLSI / WHO standard
 *     (Negative, Trace, 1+, 2+, 3+, 4+).
 *   - Serology screening: WHO terminology (Reactive / Non-reactive).
 *   - Antimicrobial susceptibility: CLSI M100 (S / I / R).
 *   - Blood typing: ISBT (ABO + Rh D).
 */

import type { ResultFlag } from "@/lib/stores/reports";

export interface QualitativeSchema {
  /** Options shown in the dropdown, in canonical order. */
  options: readonly string[];
  /** Optional flag for each option — fed into the row's auto-flag. */
  flagFor?: Readonly<Record<string, ResultFlag>>;
}

// "Negative" → urine / stool dipstick semi-quantitative. CLSI dipstick
// reading uses 0 / Trace / 1+ / 2+ / 3+ / 4+ (and ≥3+ is generally
// considered clinically significant for proteinuria; 4+ for glucose /
// blood gets flagged as critical for the doctor's attention).
const URINE_SEMIQUANT: QualitativeSchema = {
  options: ["Negative", "Trace", "1+", "2+", "3+", "4+"],
  flagFor: {
    Negative: "Normal",
    Trace: "Normal",
    "1+": "High",
    "2+": "High",
    "3+": "High",
    "4+": "Critical",
  },
};

// "Non-reactive" → screening serology (HIV, HBsAg, Anti-HCV, syphilis).
// Reactive is escalated to Critical so the doctor is immediately notified
// — these screens require urgent confirmatory testing.
const SEROLOGY_BINARY: QualitativeSchema = {
  options: ["Non-reactive", "Reactive"],
  flagFor: {
    "Non-reactive": "Normal",
    Reactive: "Critical",
  },
};

// "Positive / Negative" → Rh D antigen typing. Neither is "abnormal" in
// itself; just identification.
const RH_TYPING: QualitativeSchema = {
  options: ["Positive", "Negative"],
};

// "A / B / AB / O" → ABO group. Identification; no abnormal value.
const ABO_GROUP: QualitativeSchema = {
  options: ["A", "B", "AB", "O"],
};

// "Sensitive / Resistant" → antimicrobial susceptibility (CLSI M100).
// Resistant gets a critical flag because it changes treatment.
const ANTIBIOGRAM: QualitativeSchema = {
  options: ["Sensitive", "Intermediate", "Resistant"],
  flagFor: {
    Sensitive: "Normal",
    Intermediate: "High",
    Resistant: "Critical",
  },
};

// Microscopy frequency — urine, stool: epithelial cells, RBCs, WBCs,
// crystals, casts. Standard ladder used in Indian small labs.
const MICROSCOPY_FREQ: QualitativeSchema = {
  options: ["Not seen", "Occasional", "Few", "1-2 / hpf", "3-5 / hpf", "Many"],
  flagFor: {
    "Not seen": "Normal",
    Occasional: "Normal",
    Few: "Normal",
    "1-2 / hpf": "Normal",
    "3-5 / hpf": "High",
    Many: "High",
  },
};

// "No growth" → culture. Anything else means an organism is present
// (technician then types the organism name in the next row / a follow-up).
const CULTURE_BINARY: QualitativeSchema = {
  options: ["No growth", "Growth observed"],
  flagFor: {
    "No growth": "Normal",
    "Growth observed": "Critical",
  },
};

/**
 * Returns the qualitative schema for a reference range, or `null` if the
 * range is numeric / descriptive / unrecognised. The check is case- and
 * whitespace-insensitive and accepts the common spelling variants seen
 * in real lab masters ("non-reactive", "Non Reactive", "nonreactive").
 */
export function qualitativeOptionsForRange(
  range: string | undefined,
): QualitativeSchema | null {
  if (!range) return null;
  const r = range.trim().toLowerCase().replace(/\s+/g, " ");

  if (r === "negative") return URINE_SEMIQUANT;
  if (
    r === "non-reactive" ||
    r === "non reactive" ||
    r === "nonreactive"
  )
    return SEROLOGY_BINARY;
  if (r === "positive / negative" || r === "positive/negative")
    return RH_TYPING;
  if (r === "a / b / ab / o" || r === "a/b/ab/o") return ABO_GROUP;
  if (r === "sensitive / resistant" || r === "sensitive/resistant")
    return ANTIBIOGRAM;
  if (r === "not seen" || r === "occasional") return MICROSCOPY_FREQ;
  if (r === "no growth") return CULTURE_BINARY;

  return null;
}
