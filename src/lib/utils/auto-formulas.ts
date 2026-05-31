/**
 * Auto-computed derived lab values.
 *
 * Ported from the upstream project. Only "safe" formulas with universal
 * definitions and no clinical-decision-making implications are included.
 * Excluded (deferred until clinical sign-off): eGFR, HOMA-IR, FAI — all
 * have multiple competing formulas where the choice changes a diagnosis.
 *
 * Each formula has a validity guard and returns `null` when inputs are
 * missing or out of physiological range — callers treat `null` as "do
 * not autofill; let the technician enter manually."
 *
 * Adapted to this codebase's shape: rules key on (testCode, parameter
 * display name) rather than the upstream form_id / field_id pair.
 */

// ────────────────────────────────────────────────────────────────────────
//  PURE FORMULAS
// ────────────────────────────────────────────────────────────────────────

/** Friedewald LDL: LDL = TC - HDL - (TG / 5). Invalid when TG ≥ 400. */
export function computeFriedewaldLdl(
  totalCholesterol: number | undefined,
  hdl: number | undefined,
  triglycerides: number | undefined,
): number | null {
  if (
    typeof totalCholesterol !== "number" ||
    typeof hdl !== "number" ||
    typeof triglycerides !== "number"
  ) {
    return null;
  }
  if (totalCholesterol <= 0 || hdl <= 0 || triglycerides < 0) return null;
  if (triglycerides >= 400) return null;
  const ldl = totalCholesterol - hdl - triglycerides / 5;
  if (ldl < 0) return null;
  return Number(ldl.toFixed(0));
}

/** VLDL from triglycerides. Same validity as Friedewald. */
export function computeVldl(triglycerides: number | undefined): number | null {
  if (typeof triglycerides !== "number") return null;
  if (triglycerides < 0 || triglycerides >= 400) return null;
  return Number((triglycerides / 5).toFixed(0));
}

/** Total / HDL ratio — atherogenic risk index. */
export function computeTotalHdlRatio(
  total: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof total !== "number" || typeof hdl !== "number") return null;
  if (total <= 0 || hdl <= 0) return null;
  return Number((total / hdl).toFixed(2));
}

/** LDL / HDL ratio. */
export function computeLdlHdlRatio(
  ldl: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof ldl !== "number" || typeof hdl !== "number") return null;
  if (ldl <= 0 || hdl <= 0) return null;
  return Number((ldl / hdl).toFixed(2));
}

/** Non-HDL cholesterol = Total - HDL. */
export function computeNonHdl(
  total: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof total !== "number" || typeof hdl !== "number") return null;
  if (total <= 0 || hdl <= 0) return null;
  if (hdl > total) return null;
  return total - hdl;
}

/** Indirect bilirubin = Total - Direct. */
export function computeIndirectBilirubin(
  total: number | undefined,
  direct: number | undefined,
): number | null {
  if (typeof total !== "number" || typeof direct !== "number") return null;
  if (total < 0 || direct < 0) return null;
  if (direct > total) return null;
  return Number((total - direct).toFixed(2));
}

/** eAG from HbA1c: ADAG formula. Valid for HbA1c 4–20%. */
export function computeEAG(hba1cPct: number | undefined): number | null {
  if (typeof hba1cPct !== "number") return null;
  if (hba1cPct < 4 || hba1cPct > 20) return null;
  return Number((28.7 * hba1cPct - 46.7).toFixed(0));
}

/** Globulin = Total Protein - Albumin. */
export function computeGlobulin(
  totalProtein: number | undefined,
  albumin: number | undefined,
): number | null {
  if (typeof totalProtein !== "number" || typeof albumin !== "number")
    return null;
  if (totalProtein <= 0 || albumin <= 0) return null;
  if (albumin > totalProtein) return null;
  return Number((totalProtein - albumin).toFixed(2));
}

/** A/G ratio = Albumin / Globulin. Pass globulin (computed or measured). */
export function computeAgRatio(
  albumin: number | undefined,
  globulin: number | undefined,
): number | null {
  if (typeof albumin !== "number" || typeof globulin !== "number") return null;
  if (albumin <= 0 || globulin <= 0) return null;
  return Number((albumin / globulin).toFixed(2));
}

// ────────────────────────────────────────────────────────────────────────
//  RULE TABLE
// ────────────────────────────────────────────────────────────────────────

/**
 * Match an entered parameter to a canonical name. Lab panels vary in
 * how they label rows ("Total Cholesterol" vs "TC vs "Cholesterol,
 * Total"); we match liberally on a normalised substring.
 */
function matches(parameter: string, ...keywords: string[]): boolean {
  const p = parameter.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  return keywords.every((kw) =>
    p.includes(kw.toLowerCase().replace(/[^a-z0-9]/g, " ").trim()),
  );
}

export interface AutoFormulaRule {
  /** Uppercase test code this rule applies to (e.g. "LIPID"). */
  testCode: string;
  /** Predicate used to find the OUTPUT parameter row by its display name. */
  matchOutput: (parameter: string) => boolean;
  /** Predicates used to find each input row by display name. */
  matchInputs: ((parameter: string) => boolean)[];
  /** Compute the derived value from the matched input values. */
  compute: (inputs: (number | undefined)[]) => number | null;
  /** Human-readable description for tooltips / debugging. */
  label: string;
}

export const AUTO_FORMULAS: AutoFormulaRule[] = [
  // Lipid Profile
  {
    testCode: "LIPID",
    matchOutput: (p) => matches(p, "vldl"),
    matchInputs: [(p) => matches(p, "triglycerides")],
    compute: ([tg]) => computeVldl(tg),
    label: "VLDL = Triglycerides / 5",
  },
  {
    testCode: "LIPID",
    matchOutput: (p) => matches(p, "total", "hdl", "ratio"),
    matchInputs: [
      (p) => matches(p, "total", "cholesterol") && !matches(p, "ratio"),
      (p) =>
        matches(p, "hdl") && !matches(p, "ldl") && !matches(p, "ratio"),
    ],
    compute: ([tc, hdl]) => computeTotalHdlRatio(tc, hdl),
    label: "Total / HDL Ratio (atherogenic risk)",
  },
  {
    testCode: "LIPID",
    matchOutput: (p) =>
      matches(p, "ldl") && !matches(p, "vldl") && !matches(p, "ratio"),
    matchInputs: [
      (p) => matches(p, "total", "cholesterol") && !matches(p, "ratio"),
      (p) =>
        matches(p, "hdl") && !matches(p, "ldl") && !matches(p, "ratio"),
      (p) => matches(p, "triglycerides"),
    ],
    compute: ([tc, hdl, tg]) => computeFriedewaldLdl(tc, hdl, tg),
    label: "LDL = Total - HDL - (Triglycerides / 5) — Friedewald",
  },

  // HbA1c
  {
    testCode: "HBA1C",
    matchOutput: (p) =>
      matches(p, "estimated") || matches(p, "eag") || matches(p, "average", "glucose"),
    matchInputs: [(p) => matches(p, "hba1c") && !matches(p, "estimated")],
    compute: ([h]) => computeEAG(h),
    label: "eAG = 28.7 × HbA1c − 46.7 (ADAG)",
  },

  // Liver Function Test
  {
    testCode: "LFT",
    matchOutput: (p) => matches(p, "indirect", "bilirubin"),
    matchInputs: [
      (p) => matches(p, "total", "bilirubin") && !matches(p, "indirect"),
      (p) =>
        matches(p, "direct", "bilirubin") && !matches(p, "indirect"),
    ],
    compute: ([total, direct]) => computeIndirectBilirubin(total, direct),
    label: "Indirect Bilirubin = Total − Direct",
  },
  {
    testCode: "LFT",
    matchOutput: (p) =>
      matches(p, "globulin") && !matches(p, "ratio"),
    matchInputs: [
      (p) => matches(p, "total", "protein"),
      (p) => matches(p, "albumin") && !matches(p, "globulin"),
    ],
    compute: ([tp, alb]) => computeGlobulin(tp, alb),
    label: "Globulin = Total Protein − Albumin",
  },
  {
    testCode: "LFT",
    matchOutput: (p) => matches(p, "a", "g", "ratio") || matches(p, "albumin", "globulin", "ratio"),
    matchInputs: [
      (p) => matches(p, "albumin") && !matches(p, "globulin"),
      (p) => matches(p, "globulin") && !matches(p, "ratio"),
    ],
    compute: ([alb, glo]) => computeAgRatio(alb, glo),
    label: "A/G Ratio = Albumin / Globulin",
  },
];

// ────────────────────────────────────────────────────────────────────────
//  APPLY
// ────────────────────────────────────────────────────────────────────────

interface RowLike {
  parameter: string;
  value: string;
}

/**
 * Given a test code and the current row values, return a map of
 * { parameter-name → new value } for any derived rows that can be
 * auto-filled. Caller can merge these back into their row state.
 *
 * Returns an empty map when:
 *   - no rule applies to this test code, OR
 *   - inputs are missing / out of range
 *
 * Auto-fill is "best effort": we never blank an existing value out.
 * If TG goes above 400 (Friedewald invalid), the previously-computed
 * LDL stays put — the technician can then type a direct-measurement
 * LDL over it without the field being wiped.
 */
export function deriveAutoValues<T extends RowLike>(
  testCode: string | undefined,
  rows: T[],
): Map<string, string> {
  const derived = new Map<string, string>();
  if (!testCode) return derived;
  const code = testCode.toUpperCase();
  const rules = AUTO_FORMULAS.filter((r) => r.testCode === code);
  if (rules.length === 0) return derived;

  const parse = (s: string): number | undefined => {
    const t = s.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };

  for (const rule of rules) {
    const outputRow = rows.find((r) => rule.matchOutput(r.parameter));
    if (!outputRow) continue;
    const inputs = rule.matchInputs.map((pred) => {
      const row = rows.find((r) => pred(r.parameter));
      return row ? parse(row.value) : undefined;
    });
    const result = rule.compute(inputs);
    if (result === null) continue;
    derived.set(outputRow.parameter, String(result));
  }
  return derived;
}
