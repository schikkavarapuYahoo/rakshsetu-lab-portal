/**
 * Standard test report form definitions.
 *
 * Each form represents a specific lab test. Fields define what the
 * lab tech enters; reference ranges define what's normal; alert
 * thresholds drive the family-notification system.
 *
 * To add a new test type: append to STANDARD_FORMS. The portal will
 * auto-render it. No backend changes needed.
 *
 * IMPORTANT: thresholds here are conservative defaults based on
 * Indian medical guidelines (ICMR / Indian Diabetes Association).
 * Labs can override per-test ranges if needed in v2.
 */

export type FieldType = 'number' | 'text' | 'longtext' | 'select';

export interface FormField {
  id: string;
  label: string;
  unit?: string;
  type: FieldType;
  required?: boolean;
  /** Inclusive normal range — values outside trigger UI warning */
  normalMin?: number;
  normalMax?: number;
  /** Critical thresholds — trigger family alerts */
  criticalLow?: number;
  criticalHigh?: number;
  /** Warning-tier thresholds — softer family alerts */
  warningLow?: number;
  warningHigh?: number;
  /** Options for select fields */
  options?: string[];
  /** Help text shown below the field */
  hint?: string;
  /** Placeholder shown in the input */
  placeholder?: string;
}

/**
 * Test categories. Extended in Round 9 to cover the full Indian-lab
 * diagnostic catalog. Order in the cart UI follows CATEGORIES_ORDER
 * defined separately in select-tests/page.tsx.
 */
export type FormCategory =
  | 'hematology'
  | 'diabetes'
  | 'kidney'
  | 'liver'
  | 'cardiac'
  | 'thyroid'
  | 'reproductive_hormones'
  | 'other_hormones'
  | 'vitamin'
  | 'infectious_fever'
  | 'infectious_viral'
  | 'tuberculosis'
  | 'cardiology_advanced'
  | 'coagulation'
  | 'autoimmune'
  | 'allergy'
  | 'tumor_markers'
  | 'genetic'
  | 'blood_bank'
  | 'toxicology'
  | 'urology'
  | 'general'
  | 'panel'
  | 'other';

export interface FormDefinition {
  id: string;
  name: string;
  category: FormCategory;
  /** Short description shown in the form picker */
  description: string;
  /** Order in the picker (lower = earlier) */
  order: number;
  fields: FormField[];
  /** Optional notes shown to the lab tech when filling */
  notes?: string;
  /**
   * Default price in paise (₹1 = 100 paise) that the lab charges the
   * patient for this test. Indian-market starting points based on
   * 2024-2026 chain-lab pricing (LabPath, Thyrocare, Apollo Diagnostics,
   * Dr. Lal PathLabs publicly visible rates).
   *
   * Lab admin can override per-test in lab-settings; the override is
   * stored at labs/{labId}/test_pricing/{form_id}.price_paise.
   *
   * Tier-1 cities typically charge more; tier-3 typically less.
   * Labs SHOULD review and customize before going live with patients.
   */
  default_price_paise: number;
  /**
   * For panel/bundle entries (category = 'panel'): array of form_ids
   * that this panel includes. When tech adds a panel to cart, all
   * component tests get added (each as its own DraftTest).
   *
   * For individual tests this is undefined.
   */
  bundle_form_ids?: string[];
  /**
   * Provenance tag for reference-range auditing. All Round 9 Session
   * D2 forms are tagged 'rakshsetu_v1_starter' meaning the ranges
   * came from publicly visible Indian chain-lab pricing pages and
   * should be clinically reviewed before patient-facing use.
   */
  source?: 'rakshsetu_v1_curated' | 'rakshsetu_v1_starter';
}

export const STANDARD_FORMS: FormDefinition[] = [
  // ───────── DIABETES PANEL ─────────
  {
    id: 'random_blood_sugar',
    name: 'Random Blood Sugar',
    category: 'diabetes',
    description: 'Single glucose reading — no fasting requirement',
    order: 10,
    default_price_paise: 8000,
    fields: [
      {
        id: 'glucose_value',
        label: 'Glucose',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 70,
        normalMax: 140,
        criticalLow: 54,
        criticalHigh: 350,
        warningLow: 70,
        warningHigh: 250,
        placeholder: '120',
      },
    ],
  },
  {
    id: 'fasting_blood_sugar',
    name: 'Fasting Blood Sugar (FBS)',
    category: 'diabetes',
    description: 'Glucose after 8+ hours of fasting',
    order: 11,
    default_price_paise: 8000,
    fields: [
      {
        id: 'glucose_value',
        label: 'Fasting Glucose',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 70,
        normalMax: 100,
        criticalLow: 54,
        criticalHigh: 250,
        warningLow: 70,
        warningHigh: 126,
        hint: 'Normal: 70-100. Pre-diabetic: 100-125. Diabetic: ≥126.',
        placeholder: '95',
      },
    ],
  },
  {
    id: 'pp_blood_sugar',
    name: 'Post-Prandial Blood Sugar (PPBS)',
    category: 'diabetes',
    description: 'Glucose 2 hours after meal',
    order: 12,
    default_price_paise: 8000,
    fields: [
      {
        id: 'glucose_value',
        label: 'PP Glucose',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 70,
        normalMax: 140,
        criticalLow: 54,
        criticalHigh: 350,
        warningLow: 70,
        warningHigh: 200,
        hint: 'Normal: <140. Diabetic: ≥200.',
        placeholder: '130',
      },
    ],
  },
  {
    id: 'hba1c',
    name: 'HbA1c (Glycated Hemoglobin)',
    category: 'diabetes',
    description: '3-month average blood sugar control marker',
    order: 13,
    default_price_paise: 35000,
    fields: [
      {
        id: 'hba1c_value',
        label: 'HbA1c',
        unit: '%',
        type: 'number',
        required: true,
        normalMin: 4.0,
        normalMax: 5.6,
        warningHigh: 6.5,
        criticalHigh: 9.0,
        hint: 'Normal: <5.7. Pre-diabetic: 5.7-6.4. Diabetic: ≥6.5. Poor control: ≥9.',
        placeholder: '5.8',
      },
      {
        id: 'estimated_avg_glucose',
        label: 'Estimated Average Glucose (eAG)',
        unit: 'mg/dL',
        type: 'number',
        normalMin: 70,
        normalMax: 130,
        hint: 'Auto-derived from HbA1c if you leave it blank.',
        placeholder: 'Auto-calculated',
      },
    ],
    notes: 'eAG = (HbA1c × 28.7) − 46.7',
  },

  // ───────── CARDIAC ─────────
  {
    id: 'lipid_profile',
    name: 'Lipid Profile',
    category: 'cardiac',
    description: 'Cholesterol panel — total, HDL, LDL, triglycerides',
    order: 20,
    default_price_paise: 45000,
    fields: [
      {
        id: 'total_cholesterol',
        label: 'Total Cholesterol',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMax: 200,
        warningHigh: 240,
        criticalHigh: 300,
      },
      {
        id: 'hdl',
        label: 'HDL Cholesterol (Good)',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 40,
        warningLow: 35,
        hint: 'Higher is better. Men: ≥40, Women: ≥50.',
      },
      {
        id: 'ldl',
        label: 'LDL Cholesterol (Bad)',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMax: 100,
        warningHigh: 160,
        criticalHigh: 190,
        hint: 'Lower is better. Optimal: <100.',
      },
      {
        id: 'triglycerides',
        label: 'Triglycerides',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMax: 150,
        warningHigh: 200,
        criticalHigh: 500,
      },
      {
        id: 'vldl',
        label: 'VLDL',
        unit: 'mg/dL',
        type: 'number',
        normalMax: 30,
        warningHigh: 40,
      },
      {
        id: 'tc_hdl_ratio',
        label: 'TC / HDL Ratio',
        type: 'number',
        normalMax: 4.0,
        warningHigh: 5.0,
        hint: 'Auto-calculated from Total Cholesterol / HDL.',
      },
    ],
  },
  {
    id: 'blood_pressure',
    name: 'Blood Pressure',
    category: 'cardiac',
    description: 'Systolic + Diastolic + Pulse',
    order: 21,
    default_price_paise: 5000,
    fields: [
      {
        id: 'systolic',
        label: 'Systolic',
        unit: 'mmHg',
        type: 'number',
        required: true,
        normalMin: 90,
        normalMax: 120,
        warningHigh: 140,
        criticalHigh: 180,
        warningLow: 90,
        criticalLow: 80,
      },
      {
        id: 'diastolic',
        label: 'Diastolic',
        unit: 'mmHg',
        type: 'number',
        required: true,
        normalMin: 60,
        normalMax: 80,
        warningHigh: 90,
        criticalHigh: 120,
        warningLow: 60,
        criticalLow: 50,
      },
      {
        id: 'pulse',
        label: 'Pulse',
        unit: 'bpm',
        type: 'number',
        normalMin: 60,
        normalMax: 100,
        warningLow: 50,
        warningHigh: 110,
        criticalLow: 40,
        criticalHigh: 130,
      },
    ],
  },

  // ───────── THYROID ─────────
  {
    id: 'thyroid_tsh',
    name: 'TSH (Thyroid Stimulating Hormone)',
    category: 'thyroid',
    description: 'Single-test thyroid screening',
    order: 30,
    default_price_paise: 20000,
    fields: [
      {
        id: 'tsh',
        label: 'TSH',
        unit: 'µIU/mL',
        type: 'number',
        required: true,
        normalMin: 0.4,
        normalMax: 4.5,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        hint: 'Normal: 0.4-4.5. Hyperthyroid: <0.4. Hypothyroid: >4.5.',
      },
    ],
  },
  {
    id: 'thyroid_full',
    name: 'Thyroid Profile (Full)',
    category: 'thyroid',
    description: 'TSH + T3 + T4 + Free T3 + Free T4',
    order: 31,
    default_price_paise: 50000,
    fields: [
      {
        id: 'tsh',
        label: 'TSH',
        unit: 'µIU/mL',
        type: 'number',
        required: true,
        normalMin: 0.4,
        normalMax: 4.5,
        criticalLow: 0.1,
        criticalHigh: 10.0,
      },
      {
        id: 't3',
        label: 'Total T3',
        unit: 'ng/dL',
        type: 'number',
        normalMin: 80,
        normalMax: 200,
      },
      {
        id: 't4',
        label: 'Total T4',
        unit: 'µg/dL',
        type: 'number',
        normalMin: 5.0,
        normalMax: 12.0,
      },
      {
        id: 'free_t3',
        label: 'Free T3',
        unit: 'pg/mL',
        type: 'number',
        normalMin: 2.3,
        normalMax: 4.2,
      },
      {
        id: 'free_t4',
        label: 'Free T4',
        unit: 'ng/dL',
        type: 'number',
        normalMin: 0.8,
        normalMax: 1.8,
      },
    ],
  },

  // ───────── GENERAL ─────────
  {
    id: 'cbc',
    name: 'Complete Blood Count (CBC)',
    category: 'general',
    description: 'RBC, WBC, platelets, hemoglobin',
    order: 40,
    default_price_paise: 30000,
    fields: [
      {
        id: 'hemoglobin',
        label: 'Hemoglobin',
        unit: 'g/dL',
        type: 'number',
        required: true,
        normalMin: 12.0,
        normalMax: 17.5,
        warningLow: 10.0,
        criticalLow: 7.0,
        criticalHigh: 20.0,
        hint: 'Men: 13.5-17.5. Women: 12-15.5.',
      },
      {
        id: 'rbc',
        label: 'RBC',
        unit: 'million/µL',
        type: 'number',
        normalMin: 4.5,
        normalMax: 6.0,
      },
      {
        id: 'wbc',
        label: 'WBC',
        unit: '/µL',
        type: 'number',
        required: true,
        normalMin: 4000,
        normalMax: 11000,
        warningLow: 3000,
        warningHigh: 15000,
        criticalLow: 2000,
        criticalHigh: 30000,
      },
      {
        id: 'platelets',
        label: 'Platelets',
        unit: '/µL',
        type: 'number',
        required: true,
        normalMin: 150000,
        normalMax: 450000,
        warningLow: 100000,
        criticalLow: 50000,
        criticalHigh: 1000000,
      },
      {
        id: 'hematocrit',
        label: 'Hematocrit (PCV)',
        unit: '%',
        type: 'number',
        normalMin: 36,
        normalMax: 52,
      },
      { id: 'mcv', label: 'MCV', unit: 'fL', type: 'number', normalMin: 80, normalMax: 100 },
      { id: 'mch', label: 'MCH', unit: 'pg', type: 'number', normalMin: 27, normalMax: 33 },
      { id: 'mchc', label: 'MCHC', unit: 'g/dL', type: 'number', normalMin: 32, normalMax: 36 },
      { id: 'neutrophils_pct', label: 'Neutrophils', unit: '%', type: 'number', normalMin: 40, normalMax: 70 },
      { id: 'lymphocytes_pct', label: 'Lymphocytes', unit: '%', type: 'number', normalMin: 20, normalMax: 40 },
      { id: 'monocytes_pct', label: 'Monocytes', unit: '%', type: 'number', normalMin: 2, normalMax: 8 },
      { id: 'eosinophils_pct', label: 'Eosinophils', unit: '%', type: 'number', normalMin: 1, normalMax: 4 },
    ],
  },
  {
    id: 'liver_function',
    name: 'Liver Function Test (LFT)',
    category: 'general',
    description: 'Bilirubin, SGPT, SGOT, alkaline phosphatase, proteins',
    order: 41,
    default_price_paise: 60000,
    fields: [
      {
        id: 'total_bilirubin',
        label: 'Total Bilirubin',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMax: 1.2,
        warningHigh: 2.0,
        criticalHigh: 5.0,
      },
      {
        id: 'direct_bilirubin',
        label: 'Direct Bilirubin',
        unit: 'mg/dL',
        type: 'number',
        normalMax: 0.3,
        warningHigh: 0.5,
      },
      {
        id: 'sgpt',
        label: 'SGPT (ALT)',
        unit: 'U/L',
        type: 'number',
        required: true,
        normalMax: 56,
        warningHigh: 150,
        criticalHigh: 1000,
      },
      {
        id: 'sgot',
        label: 'SGOT (AST)',
        unit: 'U/L',
        type: 'number',
        required: true,
        normalMax: 40,
        warningHigh: 150,
        criticalHigh: 1000,
      },
      {
        id: 'alp',
        label: 'Alkaline Phosphatase',
        unit: 'U/L',
        type: 'number',
        normalMin: 44,
        normalMax: 147,
      },
      {
        id: 'albumin',
        label: 'Albumin',
        unit: 'g/dL',
        type: 'number',
        normalMin: 3.5,
        normalMax: 5.0,
        warningLow: 3.0,
      },
      {
        id: 'total_protein',
        label: 'Total Protein',
        unit: 'g/dL',
        type: 'number',
        normalMin: 6.0,
        normalMax: 8.3,
      },
    ],
  },
  {
    id: 'kidney_function',
    name: 'Kidney Function Test (KFT)',
    category: 'general',
    description: 'Urea, Creatinine, BUN, Uric Acid, eGFR',
    order: 42,
    default_price_paise: 60000,
    fields: [
      {
        id: 'urea',
        label: 'Urea',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 17,
        normalMax: 49,
        warningHigh: 80,
        criticalHigh: 150,
      },
      {
        id: 'creatinine',
        label: 'Creatinine',
        unit: 'mg/dL',
        type: 'number',
        required: true,
        normalMin: 0.7,
        normalMax: 1.3,
        warningHigh: 2.0,
        criticalHigh: 5.0,
        hint: 'Higher levels indicate impaired kidney function.',
      },
      {
        id: 'bun',
        label: 'BUN (Blood Urea Nitrogen)',
        unit: 'mg/dL',
        type: 'number',
        normalMin: 7,
        normalMax: 23,
      },
      {
        id: 'uric_acid',
        label: 'Uric Acid',
        unit: 'mg/dL',
        type: 'number',
        normalMin: 3.5,
        normalMax: 7.2,
        warningHigh: 9.0,
      },
      {
        id: 'egfr',
        label: 'eGFR',
        unit: 'mL/min/1.73m²',
        type: 'number',
        normalMin: 90,
        warningLow: 60,
        criticalLow: 30,
        hint: 'Lower indicates worse kidney function. <30 = severe.',
      },
    ],
  },

  // ───────── UROLOGY ─────────
  {
    id: 'urine_routine',
    name: 'Urine Routine (R/M)',
    category: 'urology',
    description: 'Color, appearance, pH, protein, glucose, ketones',
    order: 50,
    default_price_paise: 10000,
    fields: [
      { id: 'color', label: 'Color', type: 'select', options: ['Pale Yellow', 'Yellow', 'Dark Yellow', 'Amber', 'Red/Brown', 'Other'] },
      { id: 'appearance', label: 'Appearance', type: 'select', options: ['Clear', 'Slightly Turbid', 'Turbid', 'Cloudy'] },
      { id: 'ph', label: 'pH', type: 'number', normalMin: 4.5, normalMax: 8.0 },
      { id: 'specific_gravity', label: 'Specific Gravity', type: 'number', normalMin: 1.005, normalMax: 1.030 },
      { id: 'protein', label: 'Protein', type: 'select', options: ['Nil', 'Trace', '1+', '2+', '3+', '4+'] },
      { id: 'glucose', label: 'Glucose', type: 'select', options: ['Nil', 'Trace', '1+', '2+', '3+', '4+'] },
      { id: 'ketones', label: 'Ketones', type: 'select', options: ['Nil', 'Trace', '1+', '2+', '3+'] },
      { id: 'blood', label: 'Blood', type: 'select', options: ['Nil', 'Trace', '1+', '2+', '3+'] },
      { id: 'leukocytes', label: 'Leukocytes', type: 'select', options: ['Nil', 'Trace', '1+', '2+', '3+'] },
      { id: 'pus_cells', label: 'Pus Cells (per HPF)', type: 'text', placeholder: '0-2' },
      { id: 'epithelial_cells', label: 'Epithelial Cells (per HPF)', type: 'text', placeholder: '0-2' },
      { id: 'rbc', label: 'RBC (per HPF)', type: 'text', placeholder: 'Nil' },
      { id: 'casts', label: 'Casts', type: 'text', placeholder: 'Nil' },
      { id: 'crystals', label: 'Crystals', type: 'text', placeholder: 'Nil' },
    ],
  },

  // ───────── VITAMIN PANEL ─────────
  {
    id: 'vitamin_d',
    name: 'Vitamin D (25-OH)',
    category: 'vitamin',
    description: 'Vitamin D status — deficiency is common in India',
    order: 60,
    default_price_paise: 120000,
    fields: [
      {
        id: 'vitamin_d',
        label: '25-OH Vitamin D',
        unit: 'ng/mL',
        type: 'number',
        required: true,
        normalMin: 30,
        normalMax: 100,
        warningLow: 20,
        criticalLow: 10,
        criticalHigh: 150,
        hint: 'Deficient: <20. Insufficient: 20-30. Sufficient: 30-100.',
      },
    ],
  },
  {
    id: 'vitamin_b12',
    name: 'Vitamin B12',
    category: 'vitamin',
    description: 'B12 deficiency screening',
    order: 61,
    default_price_paise: 80000,
    fields: [
      {
        id: 'b12',
        label: 'Vitamin B12',
        unit: 'pg/mL',
        type: 'number',
        required: true,
        normalMin: 200,
        normalMax: 900,
        warningLow: 200,
        criticalLow: 100,
        hint: 'Deficient: <200. Borderline: 200-300.',
      },
    ],
  },

  // ───────── OTHER ─────────
  {
    id: 'custom_test',
    name: 'Custom Test Report',
    category: 'other',
    description: 'Free-form report — for tests not in our standard library',
    order: 99,
    default_price_paise: 0,
    fields: [
      { id: 'test_name', label: 'Test Name', type: 'text', required: true, placeholder: 'e.g., Allergy Panel' },
      { id: 'value', label: 'Result', type: 'longtext', required: true, placeholder: 'Enter result, range, and interpretation' },
    ],
    notes: 'For one-off tests. For recurring tests, ask us to add a dedicated form.',
  },
];

// Round 9 Session D2: extended Indian-lab catalog. Lazy-loaded after
// the original 14 to keep this file focused on the curated v1 set.
//
// CLINICAL DISCLAIMER: ranges in EXTENDED_FORMS are starting points
// from publicly visible chain-lab pricing pages, not formally adopted
// from regulatory standards. Each form is tagged
// `source: 'rakshsetu_v1_starter'`. Lab admins should review and
// override before patient-facing use.
//
// We import and spread at module load time. Unlike a top-level
// import, this is at the bottom of the file so cyclic imports
// (forms_extended.ts → forms.ts for type) resolve cleanly.
import { EXTENDED_FORMS } from './forms_extended';
STANDARD_FORMS.push(...EXTENDED_FORMS);
// Tag the original 14 forms as curated (vs starter) for audit purposes.
for (const f of STANDARD_FORMS) {
  if (f.source === undefined) f.source = 'rakshsetu_v1_curated';
}

export function getFormById(id: string): FormDefinition | undefined {
  return STANDARD_FORMS.find((f) => f.id === id);
}

export function getFormsByCategory() {
  const byCategory: Record<string, FormDefinition[]> = {};
  for (const form of STANDARD_FORMS) {
    if (!byCategory[form.category]) byCategory[form.category] = [];
    byCategory[form.category].push(form);
  }
  for (const list of Object.values(byCategory)) {
    list.sort((a, b) => a.order - b.order);
  }
  return byCategory;
}

/**
 * Evaluate severity for a numeric field value against its thresholds.
 * Returns the severity tier and a human-readable label.
 */
export function evaluateField(
  field: FormField,
  value: number
): { severity: 'normal' | 'warning' | 'critical'; label: string } {
  if (field.criticalLow !== undefined && value <= field.criticalLow) {
    return { severity: 'critical', label: 'CRITICAL LOW' };
  }
  if (field.criticalHigh !== undefined && value >= field.criticalHigh) {
    return { severity: 'critical', label: 'CRITICAL HIGH' };
  }
  if (field.warningLow !== undefined && value < field.warningLow) {
    return { severity: 'warning', label: 'LOW' };
  }
  if (field.warningHigh !== undefined && value > field.warningHigh) {
    return { severity: 'warning', label: 'HIGH' };
  }
  if (field.normalMin !== undefined && value < field.normalMin) {
    return { severity: 'warning', label: 'BELOW NORMAL' };
  }
  if (field.normalMax !== undefined && value > field.normalMax) {
    return { severity: 'warning', label: 'ABOVE NORMAL' };
  }
  return { severity: 'normal', label: 'NORMAL' };
}

/**
 * Round 9 Session C — get the effective price for a test at a lab.
 *
 * Reads `labs/{labId}/test_pricing/{formId}` for an override; falls
 * back to the form's default_price_paise if no override exists.
 *
 * NOTE: this fn issues one Firestore read per call. If you need
 * many tests' prices at once (e.g., rendering a cart with 8 tests),
 * use `getEffectivePricesForLab` below, which fetches the whole
 * test_pricing subcollection in one read.
 *
 * Returns paise. Falls back to 0 if form_id is unknown.
 */
export async function getEffectivePrice(
  db: FirebaseFirestore.Firestore,
  labId: string,
  formId: string,
): Promise<number> {
  const form = STANDARD_FORMS.find((f) => f.id === formId);
  const defaultPrice = form?.default_price_paise ?? 0;
  try {
    const overrideDoc = await db
      .collection('labs')
      .doc(labId)
      .collection('test_pricing')
      .doc(formId)
      .get();
    if (overrideDoc.exists) {
      const data = overrideDoc.data();
      if (typeof data?.price_paise === 'number') return data.price_paise;
    }
  } catch (e) {
    console.warn('[getEffectivePrice] override read failed:', e);
  }
  return defaultPrice;
}

/**
 * Get the effective prices for ALL system tests at a lab, in a single
 * Firestore read of the lab's test_pricing subcollection.
 *
 * Returns a Map<form_id, paise>. Includes every form in STANDARD_FORMS
 * even if no override exists (in which case the value is the default
 * from the form definition).
 */
export async function getEffectivePricesForLab(
  db: FirebaseFirestore.Firestore,
  labId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  // Pre-fill with defaults
  for (const f of STANDARD_FORMS) {
    result.set(f.id, f.default_price_paise);
  }
  // Apply overrides
  try {
    const snap = await db
      .collection('labs')
      .doc(labId)
      .collection('test_pricing')
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (typeof data?.price_paise === 'number') {
        result.set(doc.id, data.price_paise);
      }
    }
  } catch (e) {
    console.warn('[getEffectivePricesForLab] subcollection read failed:', e);
  }
  return result;
}

