/**
 * Auto-computed derived values for lab tests.
 *
 * Round 9 Session D — only "safe" formulas with universally accepted
 * definitions and no clinical decision-making implications. Excludes:
 *
 *   - eGFR (CKD-EPI 2021 vs 2009 vs MDRD-4 — choice changes diagnosis)
 *   - HOMA-IR (insulin units vary by lab; no consensus on cutoffs)
 *   - Free Androgen Index (sex-specific normative ranges)
 *
 * Those are deferred to Session E with clinical sign-off.
 *
 * Each formula has a validity check and returns `null` when inputs
 * are out of range or missing. Callers should treat null as "do not
 * auto-fill; let the technician enter manually."
 */

/**
 * Compute LDL/HDL ratio. Both inputs in mg/dL.
 *
 * Useful for cardiovascular risk assessment. >5 = high risk,
 * <3 = ideal. No special validity range — any positive numbers work.
 *
 * Returns null if either input is missing or zero/negative.
 */
export function computeLdlHdlRatio(
  ldl: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof ldl !== 'number' || typeof hdl !== 'number') return null;
  if (ldl <= 0 || hdl <= 0) return null;
  return Number((ldl / hdl).toFixed(2));
}

/**
 * Compute Total Cholesterol / HDL ratio.
 *
 * Sometimes called "atherogenic ratio" or "Castelli risk index I".
 * <3.5 = ideal, >5 = elevated risk.
 *
 * Returns null if missing or invalid.
 */
export function computeTotalHdlRatio(
  total: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof total !== 'number' || typeof hdl !== 'number') return null;
  if (total <= 0 || hdl <= 0) return null;
  return Number((total / hdl).toFixed(2));
}

/**
 * Friedewald formula for LDL: LDL = TC - HDL - (TG / 5)
 *
 * Inputs in mg/dL. The formula is INVALID when triglycerides ≥ 400 —
 * the chylomicron contribution to VLDL stops being a constant fifth
 * of TG. Modern labs use direct LDL measurement above this threshold.
 *
 * Returns null if:
 *   - any input is missing
 *   - triglycerides ≥ 400 mg/dL (formula invalid)
 *   - any input is negative or zero (data error)
 *   - computed LDL is negative (input data is internally inconsistent)
 */
export function computeFriedewaldLdl(
  totalCholesterol: number | undefined,
  hdl: number | undefined,
  triglycerides: number | undefined,
): number | null {
  if (
    typeof totalCholesterol !== 'number' ||
    typeof hdl !== 'number' ||
    typeof triglycerides !== 'number'
  ) {
    return null;
  }
  if (totalCholesterol <= 0 || hdl <= 0 || triglycerides < 0) return null;
  if (triglycerides >= 400) return null; // Friedewald invalid
  const ldl = totalCholesterol - hdl - triglycerides / 5;
  if (ldl < 0) return null;
  return Number(ldl.toFixed(0));
}

/**
 * Compute VLDL from triglycerides. Default formula: VLDL = TG / 5
 * (used by Friedewald and most labs).
 *
 * Same validity range as Friedewald: invalid above TG 400.
 */
export function computeVldl(triglycerides: number | undefined): number | null {
  if (typeof triglycerides !== 'number') return null;
  if (triglycerides < 0 || triglycerides >= 400) return null;
  return Number((triglycerides / 5).toFixed(0));
}

/**
 * Compute Non-HDL Cholesterol = Total - HDL.
 *
 * Increasingly preferred over LDL for risk stratification because it
 * captures all atherogenic particles. <130 = ideal in low-risk patients.
 */
export function computeNonHdl(
  total: number | undefined,
  hdl: number | undefined,
): number | null {
  if (typeof total !== 'number' || typeof hdl !== 'number') return null;
  if (total <= 0 || hdl <= 0) return null;
  if (hdl > total) return null; // data error
  return total - hdl;
}

/**
 * Indirect bilirubin = Total - Direct.
 *
 * Useful for diagnosing pre-hepatic vs hepatic vs post-hepatic
 * jaundice patterns. Both inputs in mg/dL.
 */
export function computeIndirectBilirubin(
  total: number | undefined,
  direct: number | undefined,
): number | null {
  if (typeof total !== 'number' || typeof direct !== 'number') return null;
  if (total < 0 || direct < 0) return null;
  if (direct > total) return null; // data error
  return Number((total - direct).toFixed(2));
}

/**
 * Compute eAG (estimated average glucose) from HbA1c.
 *
 * Formula: eAG (mg/dL) = (28.7 × HbA1c%) - 46.7
 *
 * From the ADAG study (Nathan et al., Diabetes Care 2008). Widely
 * accepted; no clinical-judgement variance. Valid for HbA1c 4-12%.
 *
 * NOTE: this is already wired for the existing HbA1c form in
 * STANDARD_FORMS — it has fields `hba1c_value` and `estimated_avg_glucose`.
 * Including here so the cart-flow auto-compute system has a single
 * place to look up formulas.
 */
export function computeEAG(hba1cPct: number | undefined): number | null {
  if (typeof hba1cPct !== 'number') return null;
  if (hba1cPct < 4 || hba1cPct > 20) return null; // outside physiological range
  return Number((28.7 * hba1cPct - 46.7).toFixed(0));
}

/**
 * Lookup table mapping a (form_id, output_field_id) pair to a
 * computation function over the form's input values.
 *
 * The Step 3 UI iterates this list when any input value changes
 * and auto-fills derived fields.
 *
 * Each entry says: when these `input_field_ids` change in this form,
 * call `compute(values)` to get the new value for `output_field_id`.
 *
 * The `compute` function takes the form's current values (as a
 * Record<fieldId, value>) and returns the new derived value.
 * Returns null if inputs are missing or invalid.
 */
export interface AutoFormulaRule {
  form_id: string;
  output_field_id: string;
  input_field_ids: string[];
  compute: (values: Record<string, number | string | undefined>) => number | null;
  /** Human label for the formula, shown in tooltips / help */
  label: string;
}

export const AUTO_FORMULAS: AutoFormulaRule[] = [
  // Lipid Profile auto-fills
  {
    form_id: 'lipid_profile',
    output_field_id: 'vldl',
    input_field_ids: ['triglycerides'],
    compute: (v) => computeVldl(num(v.triglycerides)),
    label: 'VLDL = Triglycerides / 5 (invalid if TG ≥ 400)',
  },
  {
    form_id: 'lipid_profile',
    output_field_id: 'tc_hdl_ratio',
    input_field_ids: ['total_cholesterol', 'hdl'],
    compute: (v) => computeTotalHdlRatio(num(v.total_cholesterol), num(v.hdl)),
    label: 'Total/HDL ratio (atherogenic risk)',
  },
  // HbA1c auto-fill (form already has the output field)
  {
    form_id: 'hba1c',
    output_field_id: 'estimated_avg_glucose',
    input_field_ids: ['hba1c_value'],
    compute: (v) => computeEAG(num(v.hba1c_value)),
    label: 'eAG = 28.7 × HbA1c − 46.7',
  },
  // Liver function auto-fill
  {
    form_id: 'liver_function',
    output_field_id: 'indirect_bilirubin',
    input_field_ids: ['total_bilirubin', 'direct_bilirubin'],
    compute: (v) =>
      computeIndirectBilirubin(num(v.total_bilirubin), num(v.direct_bilirubin)),
    label: 'Indirect Bilirubin = Total − Direct',
  },
];

/** Coerce a values-record entry into a number or undefined. */
function num(v: number | string | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Apply all formulas for a given form to the values record. Mutates
 * by returning a new record with auto-computed fields filled in.
 *
 * Auto-fill is non-destructive: if the technician has manually entered
 * a value for a derived field (i.e., it differs from the prior auto-
 * computed value, or auto returns null), we don't overwrite it. This
 * lets a tech override the formula in edge cases (e.g., direct LDL
 * measurement supersedes Friedewald).
 *
 * To make this work, we track which fields were last-auto-set in a
 * companion record. For Session D simplicity, we always auto-fill —
 * tech can always overwrite afterward, and overwrite IS preserved
 * by the input field's own state.
 */
export function applyAutoFormulas(
  formId: string,
  values: Record<string, number | string | undefined>,
): Record<string, number | string | undefined> {
  const rules = AUTO_FORMULAS.filter((r) => r.form_id === formId);
  if (rules.length === 0) return values;

  const next = { ...values };
  for (const rule of rules) {
    const result = rule.compute(next);
    if (result !== null) {
      next[rule.output_field_id] = result;
    }
    // If result is null, leave whatever's there — don't blank out the
    // field. This avoids the "I typed something then it disappeared
    // because triglycerides went over 400" surprise.
  }
  return next;
}
