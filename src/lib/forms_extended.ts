/**
 * forms_extended.ts
 *
 * Round 9 Session D2 — extended diagnostic test catalog covering the
 * full range of tests typically offered by Indian diagnostic labs.
 *
 * ⚠️ CLINICAL DISCLAIMER ⚠️
 *
 * The reference ranges in this file are starting points compiled from
 * publicly visible pricing/range pages of major Indian diagnostic
 * chains (LabPath, Thyrocare, Apollo Diagnostics, Dr. Lal PathLabs)
 * and standard Indian clinical references. They are NOT formally
 * adopted from regulatory/governmental standards and they have NOT
 * been reviewed by a clinical advisor.
 *
 * Every form here is tagged `source: 'rakshsetu_v1_starter'` to make
 * this provenance auditable. Lab admins SHOULD review and override
 * ranges per their own validated reference intervals before going
 * live with real patient reports.
 *
 * Reference ranges depend on:
 *   - Patient sex (e.g., creatinine, hemoglobin)
 *   - Patient age (e.g., TSH varies in pregnancy and pediatrics)
 *   - Patient ethnicity (e.g., eGFR formulas)
 *   - Lab assay method
 *
 * The ranges below use adult/non-pregnant defaults. Pediatric and
 * pregnancy ranges are deliberately not encoded here — those need
 * clinical sign-off (Session E).
 *
 * Family-alert thresholds (warningLow/warningHigh/criticalLow/
 * criticalHigh) are NOT set on most fields in this file. The original
 * 14 forms in forms.ts have these because they're validated for the
 * mobile app's family-alert system. New tests here only get
 * normalMin/normalMax — the alert tiers must be set during clinical
 * review on a test-by-test basis.
 *
 * Default prices: Indian tier-2 city retail rates as of late 2024.
 * Tier-1 cities (Mumbai South, Bengaluru CBD, Delhi NCR central)
 * typically charge 30-50% more; tier-3 typically 20-40% less.
 *
 * Format conventions in this file:
 *   - Compact field definitions (fewer hint/placeholder than the
 *     original 14 forms — labs add custom hints if needed)
 *   - id_naming: snake_case, prefix with form_id where ambiguous
 *     (e.g., 'liver_alt' vs just 'alt' to avoid collisions across
 *     forms when reporting on a combined PDF)
 *
 * NOTE on composite "tests":
 *   Some entries here are not really single tests — they're sets of
 *   sub-results bundled into one form because that's how Indian labs
 *   actually report them on a single line item. Examples:
 *     - Drug Abuse Panel (Urine): 7+ drug results in one form
 *     - BRCA1/BRCA2 Mutation: structured genetic report
 *     - Karyotyping, NIPT, HLA Typing: free-form pathologist output
 *     - Specific IgE Allergy Panel: longtext list of allergens
 *     - Cross Matching: multi-phase compatibility result
 *   This is acceptable for v1 because labs bill these as single line
 *   items and patients receive them as one report. If a lab wants to
 *   split any of these into separate forms (e.g., individual drug
 *   tests), that's a per-lab catalog request — Session E or later.
 */

import type { FormDefinition } from './forms';

// ═══════════════════════════════════════════════════════════════════
// HEMATOLOGY (excluding CBC which is in forms.ts)
// ═══════════════════════════════════════════════════════════════════

const HEMATOLOGY: FormDefinition[] = [
  {
    id: 'hemogram',
    name: 'Hemogram',
    category: 'hematology',
    description: 'CBC + ESR + Peripheral smear summary',
    order: 100,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL', type: 'number', required: true, normalMin: 12, normalMax: 16, placeholder: '14.0' },
      { id: 'rbc_count', label: 'RBC Count', unit: 'million/µL', type: 'number', normalMin: 4.5, normalMax: 5.9 },
      { id: 'wbc_count', label: 'WBC Count', unit: '/µL', type: 'number', normalMin: 4000, normalMax: 11000 },
      { id: 'platelet_count', label: 'Platelet Count', unit: '/µL', type: 'number', normalMin: 150000, normalMax: 450000 },
      { id: 'hematocrit', label: 'Hematocrit (PCV)', unit: '%', type: 'number', normalMin: 36, normalMax: 50 },
      { id: 'mcv', label: 'MCV', unit: 'fL', type: 'number', normalMin: 80, normalMax: 100 },
      { id: 'mch', label: 'MCH', unit: 'pg', type: 'number', normalMin: 27, normalMax: 33 },
      { id: 'mchc', label: 'MCHC', unit: 'g/dL', type: 'number', normalMin: 32, normalMax: 36 },
      { id: 'esr', label: 'ESR (Westergren)', unit: 'mm/hr', type: 'number', normalMin: 0, normalMax: 20 },
      { id: 'differential', label: 'Differential count', type: 'longtext', placeholder: 'Neutrophils %, Lymphocytes %, Monocytes %, Eosinophils %, Basophils %' },
      { id: 'peripheral_smear', label: 'Peripheral smear comment', type: 'longtext', placeholder: 'Morphology of RBCs, WBCs, platelets' },
    ],
  },
  {
    id: 'esr',
    name: 'ESR (Erythrocyte Sedimentation Rate)',
    category: 'hematology',
    description: 'Inflammation marker',
    order: 101,
    default_price_paise: 10000, // ₹100
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'esr_value', label: 'ESR', unit: 'mm/hr', type: 'number', required: true, normalMin: 0, normalMax: 20, hint: 'Westergren method. M: 0-15, F: 0-20.', placeholder: '12' },
    ],
  },
  {
    id: 'peripheral_smear',
    name: 'Peripheral Smear',
    category: 'hematology',
    description: 'Microscopic blood cell morphology — pathologist comment',
    order: 102,
    default_price_paise: 25000, // ₹250
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'rbc_morphology', label: 'RBC morphology', type: 'longtext', required: true, placeholder: 'Normocytic normochromic / microcytic hypochromic / macrocytic / etc.' },
      { id: 'wbc_morphology', label: 'WBC morphology', type: 'longtext' },
      { id: 'platelet_morphology', label: 'Platelet morphology', type: 'longtext' },
      { id: 'parasites', label: 'Parasites', type: 'select', options: ['Not seen', 'Malaria parasite seen', 'Microfilaria seen', 'Other'], required: true },
      { id: 'pathologist_comment', label: 'Pathologist impression', type: 'longtext' },
    ],
  },
  {
    id: 'reticulocyte_count',
    name: 'Reticulocyte Count',
    category: 'hematology',
    description: 'Bone marrow RBC production marker',
    order: 103,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'retic_pct', label: 'Reticulocytes', unit: '%', type: 'number', required: true, normalMin: 0.5, normalMax: 2.5, placeholder: '1.2' },
      { id: 'absolute_retic', label: 'Absolute reticulocyte count', unit: '/µL', type: 'number', normalMin: 25000, normalMax: 100000 },
    ],
  },
  {
    id: 'hematocrit',
    name: 'Hematocrit (PCV)',
    category: 'hematology',
    description: 'Packed cell volume',
    order: 104,
    default_price_paise: 8000, // ₹80
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'pcv', label: 'PCV', unit: '%', type: 'number', required: true, normalMin: 36, normalMax: 50, hint: 'M: 41-50%, F: 36-44%', placeholder: '42' },
    ],
  },
  {
    id: 'hemoglobin',
    name: 'Hemoglobin (Hb)',
    category: 'hematology',
    description: 'Single Hb level — quick anemia screen',
    order: 105,
    default_price_paise: 8000, // ₹80
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hb', label: 'Hemoglobin', unit: 'g/dL', type: 'number', required: true, normalMin: 12, normalMax: 16, hint: 'M: 13.5-17.5, F: 12-15.5. <7 critical.', placeholder: '14.0', criticalLow: 7, warningLow: 11 },
    ],
  },
  {
    id: 'platelet_count',
    name: 'Platelet Count',
    category: 'hematology',
    description: 'Standalone platelet count',
    order: 106,
    default_price_paise: 8000, // ₹80
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'platelets', label: 'Platelet count', unit: '/µL', type: 'number', required: true, normalMin: 150000, normalMax: 450000, criticalLow: 20000, warningLow: 100000, placeholder: '250000' },
    ],
  },
  {
    id: 'aec',
    name: 'Absolute Eosinophil Count (AEC)',
    category: 'hematology',
    description: 'Allergic response / parasitic infection marker',
    order: 107,
    default_price_paise: 12000, // ₹120
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'aec', label: 'AEC', unit: '/µL', type: 'number', required: true, normalMin: 40, normalMax: 440, placeholder: '200' },
    ],
  },
  {
    id: 'bleeding_time',
    name: 'Bleeding Time (BT)',
    category: 'hematology',
    description: 'Primary hemostasis screen',
    order: 108,
    default_price_paise: 8000, // ₹80
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'bt_minutes', label: 'Bleeding Time', unit: 'min', type: 'number', required: true, normalMin: 2, normalMax: 7, hint: 'Duke method', placeholder: '4' },
    ],
  },
  {
    id: 'clotting_time',
    name: 'Clotting Time (CT)',
    category: 'hematology',
    description: 'Whole blood clotting screen',
    order: 109,
    default_price_paise: 8000, // ₹80
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ct_minutes', label: 'Clotting Time', unit: 'min', type: 'number', required: true, normalMin: 5, normalMax: 12, placeholder: '8' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// DIABETES (additions to existing FBS/PPBS/RBS/HbA1c)
// ═══════════════════════════════════════════════════════════════════

const DIABETES_EXTENDED: FormDefinition[] = [
  {
    id: 'insulin',
    name: 'Insulin (Fasting)',
    category: 'diabetes',
    description: 'Insulin level — diabetes diagnosis support',
    order: 14,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'insulin_value', label: 'Insulin', unit: 'µIU/mL', type: 'number', required: true, normalMin: 2.6, normalMax: 24.9, placeholder: '8' },
    ],
  },
  {
    id: 'c_peptide',
    name: 'C-Peptide',
    category: 'diabetes',
    description: 'Endogenous insulin production marker',
    order: 15,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'c_peptide_value', label: 'C-Peptide', unit: 'ng/mL', type: 'number', required: true, normalMin: 0.5, normalMax: 2.0, placeholder: '1.2' },
    ],
  },
  {
    id: 'gtt',
    name: 'Glucose Tolerance Test (GTT)',
    category: 'diabetes',
    description: 'OGTT — multi-time-point glucose response',
    order: 16,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'gtt_fasting', label: 'Fasting glucose', unit: 'mg/dL', type: 'number', required: true, normalMin: 70, normalMax: 100 },
      { id: 'gtt_1hr', label: 'After 1 hour', unit: 'mg/dL', type: 'number', normalMin: 100, normalMax: 180 },
      { id: 'gtt_2hr', label: 'After 2 hours', unit: 'mg/dL', type: 'number', required: true, normalMin: 70, normalMax: 140 },
      { id: 'gtt_3hr', label: 'After 3 hours', unit: 'mg/dL', type: 'number', normalMin: 70, normalMax: 140 },
      { id: 'gtt_glucose_load', label: 'Glucose load given', unit: 'g', type: 'number', placeholder: '75' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// KIDNEY (extended panel — supersedes basic KFT for fuller workup)
// ═══════════════════════════════════════════════════════════════════

const KIDNEY: FormDefinition[] = [
  {
    id: 'kft_extended',
    name: 'Kidney Function Test (Extended)',
    category: 'kidney',
    description: 'Full kidney panel: creatinine, urea, BUN, uric acid, electrolytes',
    order: 110,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    notes: 'Reference ranges differ slightly between sexes — ranges below are adult averages.',
    fields: [
      { id: 'creatinine', label: 'Creatinine', unit: 'mg/dL', type: 'number', required: true, normalMin: 0.6, normalMax: 1.3, hint: 'M: 0.7-1.3, F: 0.6-1.1', placeholder: '0.9' },
      { id: 'blood_urea', label: 'Blood Urea', unit: 'mg/dL', type: 'number', normalMin: 17, normalMax: 49 },
      { id: 'bun', label: 'BUN', unit: 'mg/dL', type: 'number', normalMin: 7, normalMax: 20 },
      { id: 'uric_acid', label: 'Uric Acid', unit: 'mg/dL', type: 'number', normalMin: 3.4, normalMax: 7.0, hint: 'M: 3.4-7.0, F: 2.4-6.0' },
      { id: 'sodium', label: 'Sodium (Na)', unit: 'mEq/L', type: 'number', normalMin: 136, normalMax: 145 },
      { id: 'potassium', label: 'Potassium (K)', unit: 'mEq/L', type: 'number', normalMin: 3.5, normalMax: 5.1, criticalLow: 2.5, criticalHigh: 6.5 },
      { id: 'chloride', label: 'Chloride (Cl)', unit: 'mEq/L', type: 'number', normalMin: 98, normalMax: 107 },
      { id: 'calcium', label: 'Calcium', unit: 'mg/dL', type: 'number', normalMin: 8.6, normalMax: 10.3 },
      { id: 'phosphorus', label: 'Phosphorus', unit: 'mg/dL', type: 'number', normalMin: 2.5, normalMax: 4.5 },
    ],
  },
  {
    id: 'creatinine_only',
    name: 'Creatinine (single)',
    category: 'kidney',
    description: 'Standalone creatinine — kidney function quick check',
    order: 111,
    default_price_paise: 15000, // ₹150
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'creatinine_value', label: 'Creatinine', unit: 'mg/dL', type: 'number', required: true, normalMin: 0.6, normalMax: 1.3, hint: 'M: 0.7-1.3, F: 0.6-1.1', placeholder: '0.9' },
    ],
  },
  {
    id: 'electrolytes',
    name: 'Serum Electrolytes (Na/K/Cl)',
    category: 'kidney',
    description: 'Sodium, potassium, chloride',
    order: 112,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'sodium', label: 'Sodium (Na)', unit: 'mEq/L', type: 'number', required: true, normalMin: 136, normalMax: 145 },
      { id: 'potassium', label: 'Potassium (K)', unit: 'mEq/L', type: 'number', required: true, normalMin: 3.5, normalMax: 5.1, criticalLow: 2.5, criticalHigh: 6.5 },
      { id: 'chloride', label: 'Chloride (Cl)', unit: 'mEq/L', type: 'number', required: true, normalMin: 98, normalMax: 107 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// LIVER (extended — supersedes basic LFT for fuller workup)
// ═══════════════════════════════════════════════════════════════════

const LIVER: FormDefinition[] = [
  {
    id: 'lft_extended',
    name: 'Liver Function Test (Extended)',
    category: 'liver',
    description: 'Bilirubin (T/D/I), SGOT, SGPT, ALP, GGT, proteins',
    order: 120,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'total_bilirubin', label: 'Total Bilirubin', unit: 'mg/dL', type: 'number', required: true, normalMin: 0.2, normalMax: 1.2 },
      { id: 'direct_bilirubin', label: 'Direct Bilirubin', unit: 'mg/dL', type: 'number', normalMin: 0, normalMax: 0.3 },
      { id: 'indirect_bilirubin', label: 'Indirect Bilirubin (auto)', unit: 'mg/dL', type: 'number', hint: 'Auto: Total − Direct', normalMin: 0.2, normalMax: 1.0 },
      { id: 'sgot_ast', label: 'SGOT (AST)', unit: 'U/L', type: 'number', normalMin: 5, normalMax: 40 },
      { id: 'sgpt_alt', label: 'SGPT (ALT)', unit: 'U/L', type: 'number', normalMin: 7, normalMax: 56 },
      { id: 'alp', label: 'Alkaline Phosphatase (ALP)', unit: 'U/L', type: 'number', normalMin: 44, normalMax: 147 },
      { id: 'ggt', label: 'GGT', unit: 'U/L', type: 'number', normalMin: 9, normalMax: 48, hint: 'M: 9-48, F: 9-32' },
      { id: 'total_protein', label: 'Total Protein', unit: 'g/dL', type: 'number', normalMin: 6.4, normalMax: 8.3 },
      { id: 'albumin', label: 'Albumin', unit: 'g/dL', type: 'number', normalMin: 3.5, normalMax: 5.2 },
      { id: 'globulin', label: 'Globulin', unit: 'g/dL', type: 'number', normalMin: 2.0, normalMax: 3.5 },
      { id: 'ag_ratio', label: 'A/G Ratio', type: 'number', normalMin: 1.0, normalMax: 2.5 },
    ],
  },
  {
    id: 'ggt',
    name: 'GGT',
    category: 'liver',
    description: 'Gamma-glutamyl transferase — biliary marker',
    order: 121,
    default_price_paise: 25000, // ₹250
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ggt_value', label: 'GGT', unit: 'U/L', type: 'number', required: true, normalMin: 9, normalMax: 48 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// LIPID (additions — Non-HDL standalone)
// ═══════════════════════════════════════════════════════════════════

const LIPID_EXTENDED: FormDefinition[] = [
  {
    id: 'non_hdl_cholesterol',
    name: 'Non-HDL Cholesterol',
    category: 'cardiac',
    description: 'Atherogenic lipoprotein burden — Total minus HDL',
    order: 22,
    default_price_paise: 20000, // ₹200
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'total_cholesterol', label: 'Total Cholesterol', unit: 'mg/dL', type: 'number', required: true, normalMin: 100, normalMax: 200 },
      { id: 'hdl', label: 'HDL', unit: 'mg/dL', type: 'number', required: true, normalMin: 40, normalMax: 100 },
      { id: 'non_hdl', label: 'Non-HDL (auto)', unit: 'mg/dL', type: 'number', hint: 'Auto: Total − HDL. <130 ideal.' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// THYROID (additions to existing TSH/Thyroid Full)
// ═══════════════════════════════════════════════════════════════════

const THYROID_EXTENDED: FormDefinition[] = [
  {
    id: 'anti_tpo',
    name: 'Anti-TPO Antibody',
    category: 'thyroid',
    description: 'Autoimmune thyroid disease marker',
    order: 32,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'anti_tpo_value', label: 'Anti-TPO', unit: 'IU/mL', type: 'number', required: true, normalMin: 0, normalMax: 35, hint: '>35 suggests autoimmune thyroiditis (Hashimoto)' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// REPRODUCTIVE HORMONES
// ═══════════════════════════════════════════════════════════════════

const REPRODUCTIVE_HORMONES: FormDefinition[] = [
  {
    id: 'testosterone',
    name: 'Testosterone (Total)',
    category: 'reproductive_hormones',
    description: 'Male/female testosterone level',
    order: 200,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    notes: 'Reference ranges differ by sex. M: 280-1100, F: 15-70 ng/dL.',
    fields: [
      { id: 'testosterone_value', label: 'Testosterone', unit: 'ng/dL', type: 'number', required: true, hint: 'M: 280-1100, F: 15-70' },
      { id: 'free_testosterone', label: 'Free Testosterone (optional)', unit: 'pg/mL', type: 'number' },
    ],
  },
  {
    id: 'estrogen',
    name: 'Estrogen / Estradiol (E2)',
    category: 'reproductive_hormones',
    description: 'Female reproductive hormone — phase-dependent',
    order: 201,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    notes: 'Phase-dependent. Follicular: 30-120, Mid-cycle: 130-370, Luteal: 70-250, Postmenopause: <30 pg/mL.',
    fields: [
      { id: 'estradiol', label: 'Estradiol', unit: 'pg/mL', type: 'number', required: true },
      { id: 'cycle_phase', label: 'Cycle phase', type: 'select', options: ['Follicular', 'Ovulatory', 'Luteal', 'Postmenopausal', 'Pregnant', 'Not applicable'] },
    ],
  },
  {
    id: 'progesterone',
    name: 'Progesterone',
    category: 'reproductive_hormones',
    description: 'Female reproductive hormone — phase-dependent',
    order: 202,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'progesterone_value', label: 'Progesterone', unit: 'ng/mL', type: 'number', required: true, hint: 'Follicular: <1, Luteal: 5-20, Pregnancy: 10-300' },
      { id: 'cycle_phase', label: 'Cycle phase', type: 'select', options: ['Follicular', 'Luteal', 'Pregnancy', 'Postmenopausal', 'Not applicable'] },
    ],
  },
  {
    id: 'lh',
    name: 'LH (Luteinizing Hormone)',
    category: 'reproductive_hormones',
    description: 'Pituitary gonadotropin',
    order: 203,
    default_price_paise: 65000, // ₹650
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'lh_value', label: 'LH', unit: 'mIU/mL', type: 'number', required: true, hint: 'M: 1.7-8.6, F follicular: 2.4-12.6, F mid-cycle: 14-95, F postmenopause: 7.7-58.5' },
    ],
  },
  {
    id: 'fsh',
    name: 'FSH (Follicle Stimulating Hormone)',
    category: 'reproductive_hormones',
    description: 'Pituitary gonadotropin',
    order: 204,
    default_price_paise: 65000, // ₹650
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'fsh_value', label: 'FSH', unit: 'mIU/mL', type: 'number', required: true, hint: 'M: 1.5-12.4, F follicular: 3.5-12.5, F mid-cycle: 4.7-21.5, F postmenopause: 25.8-134.8' },
    ],
  },
  {
    id: 'prolactin',
    name: 'Prolactin',
    category: 'reproductive_hormones',
    description: 'Pituitary hormone — lactation/fertility',
    order: 205,
    default_price_paise: 55000, // ₹550
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'prolactin_value', label: 'Prolactin', unit: 'ng/mL', type: 'number', required: true, normalMin: 4, normalMax: 23, hint: 'M: 4-15.2, F non-pregnant: 4.8-23.3, F pregnant: up to 400' },
    ],
  },
  {
    id: 'amh',
    name: 'AMH (Anti-Mullerian Hormone)',
    category: 'reproductive_hormones',
    description: 'Ovarian reserve marker',
    order: 206,
    default_price_paise: 150000, // ₹1500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'amh_value', label: 'AMH', unit: 'ng/mL', type: 'number', required: true, hint: 'F reproductive age: 1.0-4.0. Low <1.0 indicates diminished ovarian reserve.' },
    ],
  },
  {
    id: 'beta_hcg',
    name: 'Beta-hCG',
    category: 'reproductive_hormones',
    description: 'Pregnancy hormone / tumor marker',
    order: 207,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'beta_hcg_value', label: 'Beta-hCG', unit: 'mIU/mL', type: 'number', required: true, hint: 'Non-pregnant: <5. Pregnancy: rises rapidly, doubles ~48hr in early gestation.' },
      { id: 'pregnancy_indicated', label: 'Pregnancy indicated', type: 'select', options: ['Negative (<5)', 'Equivocal (5-25)', 'Positive (>25)'] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// OTHER HORMONES (Vit D is in forms.ts already)
// ═══════════════════════════════════════════════════════════════════

const OTHER_HORMONES: FormDefinition[] = [
  {
    id: 'cortisol',
    name: 'Cortisol',
    category: 'other_hormones',
    description: 'Stress / adrenal function — time-dependent',
    order: 220,
    default_price_paise: 65000, // ₹650
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'cortisol_value', label: 'Cortisol', unit: 'µg/dL', type: 'number', required: true, hint: 'AM: 5-23, PM: 3-13' },
      { id: 'time_of_collection', label: 'Time of collection', type: 'select', options: ['Morning (AM 7-10)', 'Afternoon (PM 4-6)', 'Other'] },
    ],
  },
  {
    id: 'acth',
    name: 'ACTH (Adrenocorticotropic Hormone)',
    category: 'other_hormones',
    description: 'Pituitary adrenal-axis marker',
    order: 221,
    default_price_paise: 110000, // ₹1100
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'acth_value', label: 'ACTH', unit: 'pg/mL', type: 'number', required: true, normalMin: 10, normalMax: 60 },
    ],
  },
  {
    id: 'growth_hormone',
    name: 'Growth Hormone (GH)',
    category: 'other_hormones',
    description: 'Pituitary GH level',
    order: 222,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'gh_value', label: 'Growth Hormone', unit: 'ng/mL', type: 'number', required: true, hint: 'Adult M: <5, Adult F: <10' },
    ],
  },
  {
    id: 'pth',
    name: 'Parathyroid Hormone (PTH)',
    category: 'other_hormones',
    description: 'Calcium regulation marker',
    order: 223,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'pth_value', label: 'PTH (intact)', unit: 'pg/mL', type: 'number', required: true, normalMin: 15, normalMax: 65 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// VITAMIN & NUTRITIONAL (B12, D in forms.ts)
// ═══════════════════════════════════════════════════════════════════

const VITAMIN_EXTENDED: FormDefinition[] = [
  {
    id: 'folate',
    name: 'Folate / Folic Acid',
    category: 'vitamin',
    description: 'B9 deficiency screening',
    order: 62,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'folate_value', label: 'Folate (serum)', unit: 'ng/mL', type: 'number', required: true, normalMin: 3, normalMax: 17, hint: 'Deficient: <3' },
    ],
  },
  {
    id: 'ferritin',
    name: 'Ferritin',
    category: 'vitamin',
    description: 'Iron storage protein — primary anemia workup',
    order: 63,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ferritin_value', label: 'Ferritin', unit: 'ng/mL', type: 'number', required: true, hint: 'M: 30-400, F: 15-150. Low (<15) confirms iron-deficiency anemia.' },
    ],
  },
  {
    id: 'iron_studies',
    name: 'Iron Studies',
    category: 'vitamin',
    description: 'Iron + TIBC + Transferrin saturation',
    order: 64,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'iron', label: 'Serum Iron', unit: 'µg/dL', type: 'number', required: true, normalMin: 60, normalMax: 170 },
      { id: 'tibc', label: 'TIBC', unit: 'µg/dL', type: 'number', required: true, normalMin: 240, normalMax: 450 },
      { id: 'transferrin_saturation', label: 'Transferrin Saturation', unit: '%', type: 'number', normalMin: 20, normalMax: 50 },
      { id: 'ferritin', label: 'Ferritin', unit: 'ng/mL', type: 'number' },
    ],
  },
  {
    id: 'tibc',
    name: 'TIBC (Total Iron Binding Capacity)',
    category: 'vitamin',
    description: 'Standalone TIBC',
    order: 65,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'tibc_value', label: 'TIBC', unit: 'µg/dL', type: 'number', required: true, normalMin: 240, normalMax: 450 },
    ],
  },
  {
    id: 'transferrin_saturation',
    name: 'Transferrin Saturation',
    category: 'vitamin',
    description: 'Iron / TIBC ratio',
    order: 66,
    default_price_paise: 40000, // ₹400
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'transferrin_sat', label: 'Transferrin Saturation', unit: '%', type: 'number', required: true, normalMin: 20, normalMax: 50, hint: '<20% suggests iron deficiency' },
    ],
  },
  {
    id: 'zinc',
    name: 'Zinc',
    category: 'vitamin',
    description: 'Trace element',
    order: 67,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'zinc_value', label: 'Zinc', unit: 'µg/dL', type: 'number', required: true, normalMin: 70, normalMax: 120 },
    ],
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    category: 'vitamin',
    description: 'Serum magnesium',
    order: 68,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'magnesium_value', label: 'Magnesium', unit: 'mg/dL', type: 'number', required: true, normalMin: 1.7, normalMax: 2.2 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// INFECTIOUS - FEVER PANEL
// ═══════════════════════════════════════════════════════════════════

const INFECTIOUS_FEVER: FormDefinition[] = [
  {
    id: 'dengue_ns1',
    name: 'Dengue NS1 Antigen',
    category: 'infectious_fever',
    description: 'Early dengue detection (day 1-7)',
    order: 300,
    default_price_paise: 65000, // ₹650
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ns1_result', label: 'NS1 Antigen', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
      { id: 'ns1_method', label: 'Method', type: 'select', options: ['ELISA', 'Rapid card test'] },
    ],
  },
  {
    id: 'dengue_igm_igg',
    name: 'Dengue IgM / IgG',
    category: 'infectious_fever',
    description: 'Dengue antibodies — primary vs secondary infection',
    order: 301,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm_result', label: 'IgM', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
      { id: 'igg_result', label: 'IgG', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
      { id: 'interpretation', label: 'Interpretation', type: 'select', options: ['No active infection', 'Primary infection (recent)', 'Secondary/past infection', 'Indeterminate'] },
    ],
  },
  {
    id: 'malaria_antigen',
    name: 'Malaria Antigen',
    category: 'infectious_fever',
    description: 'Rapid test for P. falciparum / P. vivax',
    order: 302,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'pf_antigen', label: 'P. falciparum antigen', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'pv_antigen', label: 'P. vivax antigen', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'pan_malarial', label: 'Pan-malarial antigen', type: 'select', options: ['Negative', 'Positive'] },
    ],
  },
  {
    id: 'malaria_smear',
    name: 'Peripheral Smear for Malaria',
    category: 'infectious_fever',
    description: 'Microscopy — gold standard',
    order: 303,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'parasite_seen', label: 'Malaria parasite', type: 'select', required: true, options: ['Not seen', 'P. falciparum seen', 'P. vivax seen', 'P. malariae seen', 'P. ovale seen', 'Mixed'] },
      { id: 'parasite_density', label: 'Parasite density', type: 'text', placeholder: 'e.g., 1+ / 2+ / parasites per µL' },
      { id: 'comment', label: 'Pathologist comment', type: 'longtext' },
    ],
  },
  {
    id: 'widal',
    name: 'Widal Test',
    category: 'infectious_fever',
    description: 'Typhoid agglutination test',
    order: 304,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 's_typhi_o', label: 'S. Typhi "O"', type: 'text', required: true, placeholder: '1:80', hint: 'Significant titer ≥1:160' },
      { id: 's_typhi_h', label: 'S. Typhi "H"', type: 'text', required: true, placeholder: '1:80' },
      { id: 's_paratyphi_a_h', label: 'S. Paratyphi A "H"', type: 'text', placeholder: '1:40' },
      { id: 's_paratyphi_b_h', label: 'S. Paratyphi B "H"', type: 'text', placeholder: '1:40' },
    ],
  },
  {
    id: 'typhidot',
    name: 'TyphiDot (IgM/IgG)',
    category: 'infectious_fever',
    description: 'Typhoid antibody — more specific than Widal',
    order: 305,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm', label: 'TyphiDot IgM', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
      { id: 'igg', label: 'TyphiDot IgG', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
    ],
  },
  {
    id: 'chikungunya_igm',
    name: 'Chikungunya IgM',
    category: 'infectious_fever',
    description: 'Chikungunya antibody',
    order: 306,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm_result', label: 'Chikungunya IgM', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
    ],
  },
  {
    id: 'leptospira_antibody',
    name: 'Leptospira Antibody',
    category: 'infectious_fever',
    description: 'Leptospirosis screening',
    order: 307,
    default_price_paise: 100000, // ₹1000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm_result', label: 'Leptospira IgM', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
      { id: 'igg_result', label: 'Leptospira IgG', type: 'select', options: ['Negative', 'Positive', 'Equivocal'] },
    ],
  },
  {
    id: 'scrub_typhus',
    name: 'Scrub Typhus Antibody',
    category: 'infectious_fever',
    description: 'Orientia tsutsugamushi screening',
    order: 308,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm_result', label: 'Scrub Typhus IgM', type: 'select', required: true, options: ['Negative', 'Positive', 'Equivocal'] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// VIRAL INFECTIONS
// ═══════════════════════════════════════════════════════════════════

const VIRAL: FormDefinition[] = [
  {
    id: 'hiv_1_2',
    name: 'HIV 1 & 2 Antibody',
    category: 'infectious_viral',
    description: 'HIV screening',
    order: 320,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    notes: 'Reactive results require confirmatory testing per ICMR guidelines.',
    fields: [
      { id: 'hiv_result', label: 'HIV 1 & 2 Antibody', type: 'select', required: true, options: ['Non-Reactive', 'Reactive', 'Indeterminate'] },
      { id: 'method', label: 'Method', type: 'select', options: ['ELISA', 'Rapid', 'CLIA'] },
    ],
  },
  {
    id: 'hbsag',
    name: 'HBsAg (Hepatitis B Surface Antigen)',
    category: 'infectious_viral',
    description: 'Hepatitis B screening',
    order: 321,
    default_price_paise: 40000, // ₹400
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hbsag_result', label: 'HBsAg', type: 'select', required: true, options: ['Non-Reactive', 'Reactive', 'Indeterminate'] },
      { id: 'method', label: 'Method', type: 'select', options: ['ELISA', 'Rapid', 'CLIA'] },
    ],
  },
  {
    id: 'hcv_antibody',
    name: 'HCV Antibody',
    category: 'infectious_viral',
    description: 'Hepatitis C screening',
    order: 322,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hcv_result', label: 'Anti-HCV', type: 'select', required: true, options: ['Non-Reactive', 'Reactive', 'Indeterminate'] },
    ],
  },
  {
    id: 'hav_igm',
    name: 'HAV IgM (Hepatitis A)',
    category: 'infectious_viral',
    description: 'Acute Hepatitis A',
    order: 323,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hav_igm_result', label: 'HAV IgM', type: 'select', required: true, options: ['Non-Reactive', 'Reactive', 'Indeterminate'] },
    ],
  },
  {
    id: 'hev_igm',
    name: 'HEV IgM (Hepatitis E)',
    category: 'infectious_viral',
    description: 'Acute Hepatitis E',
    order: 324,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hev_igm_result', label: 'HEV IgM', type: 'select', required: true, options: ['Non-Reactive', 'Reactive', 'Indeterminate'] },
    ],
  },
  {
    id: 'covid_pcr',
    name: 'COVID-19 RT-PCR',
    category: 'infectious_viral',
    description: 'SARS-CoV-2 nucleic acid test',
    order: 325,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'pcr_result', label: 'RT-PCR result', type: 'select', required: true, options: ['Negative', 'Positive', 'Inconclusive'] },
      { id: 'ct_value', label: 'Ct value (if positive)', type: 'number' },
      { id: 'genes_detected', label: 'Genes detected', type: 'text', placeholder: 'e.g., E, RdRp, N' },
    ],
  },
  {
    id: 'covid_antibody',
    name: 'COVID-19 Antibody',
    category: 'infectious_viral',
    description: 'Past COVID exposure / vaccination response',
    order: 326,
    default_price_paise: 65000, // ₹650
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igm', label: 'COVID IgM', type: 'select', options: ['Non-Reactive', 'Reactive'] },
      { id: 'igg', label: 'COVID IgG', type: 'select', options: ['Non-Reactive', 'Reactive'] },
      { id: 'spike_titer', label: 'Spike antibody titer', unit: 'AU/mL', type: 'number' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// TUBERCULOSIS
// ═══════════════════════════════════════════════════════════════════

const TUBERCULOSIS: FormDefinition[] = [
  {
    id: 'tb_gold_igra',
    name: 'TB Gold (IGRA / QuantiFERON)',
    category: 'tuberculosis',
    description: 'Latent TB infection screening',
    order: 340,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igra_result', label: 'IGRA result', type: 'select', required: true, options: ['Negative', 'Positive', 'Indeterminate'] },
      { id: 'tb_antigen_minus_nil', label: 'TB Ag minus Nil', unit: 'IU/mL', type: 'number' },
    ],
  },
  {
    id: 'mantoux_blood_panel',
    name: 'Mantoux-related Blood Investigation',
    category: 'tuberculosis',
    description: 'CBC + ESR + CRP supportive workup',
    order: 341,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'esr', label: 'ESR', unit: 'mm/hr', type: 'number', normalMin: 0, normalMax: 20 },
      { id: 'crp', label: 'CRP', unit: 'mg/L', type: 'number', normalMin: 0, normalMax: 5 },
      { id: 'tlc', label: 'Total leukocyte count', unit: '/µL', type: 'number', normalMin: 4000, normalMax: 11000 },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'cbnaat_genexpert',
    name: 'CBNAAT / GeneXpert (TB)',
    category: 'tuberculosis',
    description: 'M. tuberculosis detection + rifampicin resistance',
    order: 342,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'mtb_detection', label: 'MTB detection', type: 'select', required: true, options: ['Not detected', 'Detected — Low', 'Detected — Medium', 'Detected — High', 'Detected — Very Low'] },
      { id: 'rif_resistance', label: 'Rifampicin resistance', type: 'select', required: true, options: ['Not detected', 'Detected', 'Indeterminate', 'Not applicable'] },
      { id: 'sample_type', label: 'Sample', type: 'select', options: ['Sputum', 'BAL', 'CSF', 'Tissue', 'Other'] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// CARDIOLOGY (advanced — beyond basic Lipid + BP)
// ═══════════════════════════════════════════════════════════════════

const CARDIOLOGY_ADVANCED: FormDefinition[] = [
  {
    id: 'troponin_i',
    name: 'Troponin-I',
    category: 'cardiology_advanced',
    description: 'Cardiac muscle damage marker — MI workup',
    order: 360,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'troponin_i_value', label: 'Troponin-I', unit: 'ng/mL', type: 'number', required: true, hint: 'Normal: <0.04. Borderline: 0.04-0.4. Suggestive of MI: >0.4', criticalHigh: 0.4 },
    ],
  },
  {
    id: 'ck_mb',
    name: 'CK-MB',
    category: 'cardiology_advanced',
    description: 'Creatine Kinase-MB isoenzyme',
    order: 361,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ck_mb_value', label: 'CK-MB', unit: 'ng/mL', type: 'number', required: true, normalMin: 0, normalMax: 5, hint: '>5 suggestive of cardiac injury' },
      { id: 'total_ck', label: 'Total CK (optional)', unit: 'U/L', type: 'number' },
    ],
  },
  {
    id: 'ldh',
    name: 'LDH (Lactate Dehydrogenase)',
    category: 'cardiology_advanced',
    description: 'General tissue damage marker',
    order: 362,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ldh_value', label: 'LDH', unit: 'U/L', type: 'number', required: true, normalMin: 140, normalMax: 280 },
    ],
  },
  {
    id: 'hs_crp',
    name: 'hs-CRP (High-sensitivity CRP)',
    category: 'cardiology_advanced',
    description: 'Cardiovascular inflammation marker',
    order: 363,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hs_crp_value', label: 'hs-CRP', unit: 'mg/L', type: 'number', required: true, hint: 'Low risk: <1, Moderate: 1-3, High: >3' },
    ],
  },
  {
    id: 'homocysteine',
    name: 'Homocysteine',
    category: 'cardiology_advanced',
    description: 'Cardiovascular and B12/folate marker',
    order: 364,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'homocysteine_value', label: 'Homocysteine', unit: 'µmol/L', type: 'number', required: true, normalMin: 5, normalMax: 15 },
    ],
  },
  {
    id: 'bnp_nt_probnp',
    name: 'BNP / NT-proBNP',
    category: 'cardiology_advanced',
    description: 'Heart failure marker',
    order: 365,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'measurement_type', label: 'Test type', type: 'select', required: true, options: ['BNP', 'NT-proBNP'] },
      { id: 'value', label: 'Value', unit: 'pg/mL', type: 'number', required: true, hint: 'BNP <100 / NT-proBNP <125 — heart failure unlikely' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// COAGULATION
// ═══════════════════════════════════════════════════════════════════

const COAGULATION: FormDefinition[] = [
  {
    id: 'pt_inr',
    name: 'PT/INR (Prothrombin Time)',
    category: 'coagulation',
    description: 'Extrinsic clotting pathway — warfarin monitoring',
    order: 380,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'pt_seconds', label: 'PT', unit: 'sec', type: 'number', required: true, normalMin: 11, normalMax: 13.5 },
      { id: 'inr', label: 'INR', type: 'number', required: true, normalMin: 0.8, normalMax: 1.2, hint: 'Therapeutic on warfarin: 2.0-3.0', criticalHigh: 5.0 },
      { id: 'control', label: 'Control PT', unit: 'sec', type: 'number' },
    ],
  },
  {
    id: 'aptt',
    name: 'aPTT (Activated Partial Thromboplastin Time)',
    category: 'coagulation',
    description: 'Intrinsic clotting pathway — heparin monitoring',
    order: 381,
    default_price_paise: 30000, // ₹300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'aptt_seconds', label: 'aPTT', unit: 'sec', type: 'number', required: true, normalMin: 25, normalMax: 35 },
      { id: 'control', label: 'Control aPTT', unit: 'sec', type: 'number' },
    ],
  },
  {
    id: 'd_dimer',
    name: 'D-Dimer',
    category: 'coagulation',
    description: 'Fibrin degradation marker — DVT/PE/DIC workup',
    order: 382,
    default_price_paise: 100000, // ₹1000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'd_dimer_value', label: 'D-Dimer', unit: 'ng/mL FEU', type: 'number', required: true, normalMin: 0, normalMax: 500, hint: '>500 suggests acute thrombosis' },
    ],
  },
  {
    id: 'fibrinogen',
    name: 'Fibrinogen',
    category: 'coagulation',
    description: 'Coagulation factor I',
    order: 383,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'fibrinogen_value', label: 'Fibrinogen', unit: 'mg/dL', type: 'number', required: true, normalMin: 200, normalMax: 400 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// AUTOIMMUNE & RHEUMATOLOGY
// ═══════════════════════════════════════════════════════════════════

const AUTOIMMUNE: FormDefinition[] = [
  {
    id: 'ana',
    name: 'ANA (Anti-Nuclear Antibody)',
    category: 'autoimmune',
    description: 'Autoimmune disease screen',
    order: 400,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ana_result', label: 'ANA', type: 'select', required: true, options: ['Negative', 'Positive — Speckled', 'Positive — Homogeneous', 'Positive — Nucleolar', 'Positive — Centromere', 'Positive — Mixed', 'Other'] },
      { id: 'titer', label: 'Titer (if positive)', type: 'text', placeholder: '1:80, 1:160, 1:320, etc.' },
      { id: 'method', label: 'Method', type: 'select', options: ['IFA on HEp-2', 'ELISA', 'Other'] },
    ],
  },
  {
    id: 'ana_profile',
    name: 'ANA Profile (Extended)',
    category: 'autoimmune',
    description: 'Specific autoantibodies — SLE/SS/MCTD differential',
    order: 401,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'dsdna', label: 'Anti-dsDNA', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'ssa_ro', label: 'Anti-SSA (Ro)', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'ssb_la', label: 'Anti-SSB (La)', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'sm', label: 'Anti-Sm', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'rnp', label: 'Anti-RNP', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'scl_70', label: 'Anti-Scl-70', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'jo_1', label: 'Anti-Jo-1', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'centromere_b', label: 'Anti-Centromere B', type: 'select', options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'rheumatoid_factor',
    name: 'Rheumatoid Factor (RF)',
    category: 'autoimmune',
    description: 'Rheumatoid arthritis screen',
    order: 402,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'rf_value', label: 'RF', unit: 'IU/mL', type: 'number', required: true, normalMin: 0, normalMax: 14 },
    ],
  },
  {
    id: 'anti_ccp',
    name: 'Anti-CCP',
    category: 'autoimmune',
    description: 'More specific RA marker than RF',
    order: 403,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'anti_ccp_value', label: 'Anti-CCP', unit: 'U/mL', type: 'number', required: true, normalMin: 0, normalMax: 20 },
    ],
  },
  {
    id: 'crp',
    name: 'CRP (C-Reactive Protein)',
    category: 'autoimmune',
    description: 'Acute inflammation marker',
    order: 404,
    default_price_paise: 35000, // ₹350
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'crp_value', label: 'CRP', unit: 'mg/L', type: 'number', required: true, normalMin: 0, normalMax: 5, hint: 'Different from hs-CRP — uses standard sensitivity assay' },
    ],
  },
  {
    id: 'aso_titer',
    name: 'ASO Titer (Anti-Streptolysin O)',
    category: 'autoimmune',
    description: 'Recent streptococcal infection — RHD workup',
    order: 405,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'aso_value', label: 'ASO Titer', unit: 'IU/mL', type: 'number', required: true, normalMin: 0, normalMax: 200 },
    ],
  },
  {
    id: 'dsdna',
    name: 'Anti-dsDNA',
    category: 'autoimmune',
    description: 'Highly specific for SLE',
    order: 406,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'dsdna_value', label: 'Anti-dsDNA', unit: 'IU/mL', type: 'number', required: true, normalMin: 0, normalMax: 30 },
    ],
  },
  {
    id: 'anca',
    name: 'ANCA (c-ANCA / p-ANCA)',
    category: 'autoimmune',
    description: 'Vasculitis screening',
    order: 407,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'c_anca', label: 'c-ANCA (PR3)', type: 'select', required: true, options: ['Negative', 'Positive', 'Borderline'] },
      { id: 'p_anca', label: 'p-ANCA (MPO)', type: 'select', required: true, options: ['Negative', 'Positive', 'Borderline'] },
    ],
  },
  {
    id: 'complement_c3_c4',
    name: 'Complement C3 / C4',
    category: 'autoimmune',
    description: 'Complement system assessment',
    order: 408,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'c3', label: 'Complement C3', unit: 'mg/dL', type: 'number', required: true, normalMin: 90, normalMax: 180 },
      { id: 'c4', label: 'Complement C4', unit: 'mg/dL', type: 'number', required: true, normalMin: 10, normalMax: 40 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// ALLERGY & IMMUNOLOGY
// ═══════════════════════════════════════════════════════════════════

const ALLERGY: FormDefinition[] = [
  {
    id: 'total_ige',
    name: 'Total IgE',
    category: 'allergy',
    description: 'Allergic disease marker',
    order: 420,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ige_value', label: 'Total IgE', unit: 'IU/mL', type: 'number', required: true, normalMin: 0, normalMax: 100 },
    ],
  },
  {
    id: 'specific_ige_panel',
    name: 'Specific IgE Allergy Panel',
    category: 'allergy',
    description: 'Multi-allergen specific IgE panel',
    order: 421,
    default_price_paise: 600000, // ₹6000
    source: 'rakshsetu_v1_starter',
    notes: 'Lab to enter individual allergens and class scores (0-6).',
    fields: [
      { id: 'panel_type', label: 'Panel type', type: 'select', options: ['Indian food panel', 'Indian inhalant panel', 'Pediatric panel', 'Mixed', 'Custom'] },
      { id: 'positive_allergens', label: 'Positive allergens (with class)', type: 'longtext', required: true, placeholder: 'e.g., Dust mite (Class 4), Cat dander (Class 2)' },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'ig_profile',
    name: 'Immunoglobulin Profile (IgG / IgA / IgM)',
    category: 'allergy',
    description: 'Quantitative immunoglobulins',
    order: 422,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'igg', label: 'IgG', unit: 'mg/dL', type: 'number', required: true, normalMin: 700, normalMax: 1600 },
      { id: 'iga', label: 'IgA', unit: 'mg/dL', type: 'number', required: true, normalMin: 70, normalMax: 400 },
      { id: 'igm', label: 'IgM', unit: 'mg/dL', type: 'number', required: true, normalMin: 40, normalMax: 230 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// CANCER TUMOR MARKERS
// ═══════════════════════════════════════════════════════════════════

const TUMOR_MARKERS: FormDefinition[] = [
  {
    id: 'psa',
    name: 'PSA (Prostate-Specific Antigen)',
    category: 'tumor_markers',
    description: 'Prostate cancer screening',
    order: 440,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'total_psa', label: 'Total PSA', unit: 'ng/mL', type: 'number', required: true, normalMin: 0, normalMax: 4, hint: 'Age-specific cutoffs apply' },
      { id: 'free_psa', label: 'Free PSA (optional)', unit: 'ng/mL', type: 'number' },
      { id: 'free_total_ratio', label: 'Free/Total ratio %', type: 'number' },
    ],
  },
  {
    id: 'ca_125',
    name: 'CA-125',
    category: 'tumor_markers',
    description: 'Ovarian cancer marker',
    order: 441,
    default_price_paise: 100000, // ₹1000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ca_125_value', label: 'CA-125', unit: 'U/mL', type: 'number', required: true, normalMin: 0, normalMax: 35 },
    ],
  },
  {
    id: 'cea',
    name: 'CEA (Carcinoembryonic Antigen)',
    category: 'tumor_markers',
    description: 'Colorectal & other GI cancer marker',
    order: 442,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'cea_value', label: 'CEA', unit: 'ng/mL', type: 'number', required: true, normalMin: 0, normalMax: 5, hint: 'Smokers: <5; Non-smokers: <3' },
    ],
  },
  {
    id: 'afp',
    name: 'AFP (Alpha-Fetoprotein)',
    category: 'tumor_markers',
    description: 'Hepatocellular carcinoma / germ cell tumor marker',
    order: 443,
    default_price_paise: 80000, // ₹800
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'afp_value', label: 'AFP', unit: 'ng/mL', type: 'number', required: true, normalMin: 0, normalMax: 10 },
    ],
  },
  {
    id: 'ca_19_9',
    name: 'CA 19-9',
    category: 'tumor_markers',
    description: 'Pancreatic / GI cancer marker',
    order: 444,
    default_price_paise: 110000, // ₹1100
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ca_19_9_value', label: 'CA 19-9', unit: 'U/mL', type: 'number', required: true, normalMin: 0, normalMax: 37 },
    ],
  },
  {
    id: 'ca_15_3',
    name: 'CA 15-3',
    category: 'tumor_markers',
    description: 'Breast cancer marker',
    order: 445,
    default_price_paise: 120000, // ₹1200
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'ca_15_3_value', label: 'CA 15-3', unit: 'U/mL', type: 'number', required: true, normalMin: 0, normalMax: 30 },
    ],
  },
  {
    id: 'beta_2_microglobulin',
    name: 'Beta-2 Microglobulin',
    category: 'tumor_markers',
    description: 'Multiple myeloma / lymphoma marker',
    order: 446,
    default_price_paise: 150000, // ₹1500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'b2m_value', label: 'Beta-2 Microglobulin', unit: 'mg/L', type: 'number', required: true, normalMin: 0.7, normalMax: 1.8 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// GENETIC & MOLECULAR (mostly free-form interpretation)
// ═══════════════════════════════════════════════════════════════════

const GENETIC: FormDefinition[] = [
  {
    id: 'karyotyping',
    name: 'Karyotyping',
    category: 'genetic',
    description: 'Chromosome analysis — pathologist reports karyotype',
    order: 460,
    default_price_paise: 600000, // ₹6000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'karyotype', label: 'Karyotype', type: 'text', required: true, placeholder: 'e.g., 46,XY or 47,XX,+21' },
      { id: 'cells_analyzed', label: 'Cells analyzed', type: 'number' },
      { id: 'banding', label: 'Banding technique', type: 'text', placeholder: 'GTG' },
      { id: 'interpretation', label: 'Interpretation', type: 'longtext', required: true },
    ],
  },
  {
    id: 'hla_typing',
    name: 'HLA Typing',
    category: 'genetic',
    description: 'Tissue typing for transplant / disease association',
    order: 461,
    default_price_paise: 800000, // ₹8000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hla_class_i', label: 'HLA Class I (A, B, C)', type: 'longtext', required: true },
      { id: 'hla_class_ii', label: 'HLA Class II (DR, DQ, DP)', type: 'longtext', required: true },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'dna_pcr',
    name: 'DNA PCR Test',
    category: 'genetic',
    description: 'Custom PCR-based test (specify pathogen/target)',
    order: 462,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'target', label: 'Target organism / gene', type: 'text', required: true, placeholder: 'e.g., HBV DNA, HCV RNA, EBV DNA' },
      { id: 'result', label: 'Result', type: 'select', required: true, options: ['Detected', 'Not detected', 'Below detection limit', 'Inconclusive'] },
      { id: 'viral_load', label: 'Viral load (if applicable)', type: 'text', placeholder: 'IU/mL or copies/mL' },
      { id: 'interpretation', label: 'Interpretation', type: 'longtext' },
    ],
  },
  {
    id: 'brca_mutation',
    name: 'BRCA1/BRCA2 Mutation',
    category: 'genetic',
    description: 'Hereditary breast/ovarian cancer testing',
    order: 463,
    default_price_paise: 1500000, // ₹15000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'brca1_result', label: 'BRCA1', type: 'select', required: true, options: ['No pathogenic variant', 'Pathogenic variant detected', 'Variant of uncertain significance', 'Inconclusive'] },
      { id: 'brca1_variant_details', label: 'BRCA1 variant details', type: 'text' },
      { id: 'brca2_result', label: 'BRCA2', type: 'select', required: true, options: ['No pathogenic variant', 'Pathogenic variant detected', 'Variant of uncertain significance', 'Inconclusive'] },
      { id: 'brca2_variant_details', label: 'BRCA2 variant details', type: 'text' },
      { id: 'method', label: 'Method', type: 'select', options: ['NGS', 'Sanger sequencing', 'MLPA + sequencing'] },
      { id: 'interpretation', label: 'Genetic counselor comment', type: 'longtext' },
    ],
  },
  {
    id: 'thalassemia_screening',
    name: 'Thalassemia Screening (HbA2/HbF/HPLC)',
    category: 'genetic',
    description: 'Hemoglobinopathy screening',
    order: 464,
    default_price_paise: 110000, // ₹1100
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'hba', label: 'HbA', unit: '%', type: 'number', required: true, normalMin: 95, normalMax: 98 },
      { id: 'hba2', label: 'HbA2', unit: '%', type: 'number', required: true, normalMin: 1.5, normalMax: 3.5 },
      { id: 'hbf', label: 'HbF', unit: '%', type: 'number', required: true, normalMin: 0, normalMax: 2 },
      { id: 'other_hb', label: 'Other Hb variants', type: 'text' },
      { id: 'interpretation', label: 'Interpretation', type: 'select', options: ['Normal', 'Beta-thalassemia trait', 'Beta-thalassemia major suspected', 'HbE trait', 'HbS trait', 'Other variant', 'Indeterminate'] },
    ],
  },
  {
    id: 'sma_screening',
    name: 'SMA Screening (SMN1/SMN2)',
    category: 'genetic',
    description: 'Spinal muscular atrophy carrier screening',
    order: 465,
    default_price_paise: 800000, // ₹8000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'smn1_copies', label: 'SMN1 copies', type: 'number', required: true },
      { id: 'smn2_copies', label: 'SMN2 copies', type: 'number' },
      { id: 'interpretation', label: 'Interpretation', type: 'select', options: ['Normal', 'SMA carrier', 'SMA affected', 'Inconclusive'] },
    ],
  },
  {
    id: 'nipt',
    name: 'NIPT (Non-Invasive Prenatal Test)',
    category: 'genetic',
    description: 'Cell-free fetal DNA screening — chromosomal aneuploidies',
    order: 466,
    default_price_paise: 1800000, // ₹18000
    source: 'rakshsetu_v1_starter',
    notes: 'NIPT is screening, not diagnostic. Positive results require confirmatory amniocentesis/CVS.',
    fields: [
      { id: 'gestational_age', label: 'Gestational age', type: 'text', required: true, placeholder: 'e.g., 12 weeks 3 days' },
      { id: 'fetal_fraction', label: 'Fetal fraction', unit: '%', type: 'number' },
      { id: 'trisomy_21', label: 'Trisomy 21 (Down)', type: 'select', required: true, options: ['Low risk', 'High risk', 'Inconclusive'] },
      { id: 'trisomy_18', label: 'Trisomy 18 (Edwards)', type: 'select', required: true, options: ['Low risk', 'High risk', 'Inconclusive'] },
      { id: 'trisomy_13', label: 'Trisomy 13 (Patau)', type: 'select', required: true, options: ['Low risk', 'High risk', 'Inconclusive'] },
      { id: 'sex_chromosome', label: 'Sex chromosome aneuploidies', type: 'select', options: ['Low risk', 'High risk — XO', 'High risk — XXY', 'High risk — XYY', 'High risk — XXX', 'Not reported'] },
      { id: 'fetal_sex', label: 'Fetal sex (where reporting permitted)', type: 'select', options: ['Not reported per Indian PCPNDT Act', 'Reported (only outside India)'] },
      { id: 'comment', label: 'Genetic counselor comment', type: 'longtext' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// BLOOD BANK & TRANSFUSION
// ═══════════════════════════════════════════════════════════════════

const BLOOD_BANK: FormDefinition[] = [
  {
    id: 'blood_group_rh',
    name: 'Blood Group & Rh Typing',
    category: 'blood_bank',
    description: 'ABO + Rh',
    order: 480,
    default_price_paise: 15000, // ₹150
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'abo_group', label: 'ABO group', type: 'select', required: true, options: ['A', 'B', 'AB', 'O'] },
      { id: 'rh_type', label: 'Rh type', type: 'select', required: true, options: ['Positive', 'Negative'] },
    ],
  },
  {
    id: 'cross_matching',
    name: 'Cross Matching',
    category: 'blood_bank',
    description: 'Recipient-donor compatibility — pre-transfusion',
    order: 481,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'recipient_blood_group', label: 'Recipient blood group', type: 'text', required: true },
      { id: 'donor_unit_id', label: 'Donor unit ID', type: 'text', required: true },
      { id: 'donor_blood_group', label: 'Donor blood group', type: 'text', required: true },
      { id: 'major_crossmatch', label: 'Major crossmatch', type: 'select', required: true, options: ['Compatible', 'Incompatible'] },
      { id: 'minor_crossmatch', label: 'Minor crossmatch', type: 'select', required: true, options: ['Compatible', 'Incompatible'] },
      { id: 'antiglobulin_phase', label: 'Antiglobulin (Coombs) phase', type: 'select', options: ['Compatible', 'Incompatible', 'Not performed'] },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'coombs_test',
    name: 'Coombs Test (Direct & Indirect)',
    category: 'blood_bank',
    description: 'Antibody-mediated hemolysis test',
    order: 482,
    default_price_paise: 70000, // ₹700
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'direct_coombs', label: 'Direct Coombs (DAT)', type: 'select', required: true, options: ['Negative', 'Positive +1', 'Positive +2', 'Positive +3', 'Positive +4'] },
      { id: 'indirect_coombs', label: 'Indirect Coombs (IAT)', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'antibody_screening',
    name: 'Antibody Screening',
    category: 'blood_bank',
    description: 'Irregular RBC antibody screen',
    order: 483,
    default_price_paise: 50000, // ₹500
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'screen_result', label: 'Antibody screen', type: 'select', required: true, options: ['Negative', 'Positive — single antibody', 'Positive — multiple antibodies'] },
      { id: 'antibodies_identified', label: 'Antibodies identified', type: 'text', placeholder: 'e.g., Anti-D, Anti-K' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// TOXICOLOGY
// ═══════════════════════════════════════════════════════════════════

const TOXICOLOGY: FormDefinition[] = [
  {
    id: 'alcohol_level',
    name: 'Blood Alcohol Level',
    category: 'toxicology',
    description: 'Blood ethanol concentration',
    order: 500,
    default_price_paise: 60000, // ₹600
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'alcohol_value', label: 'Blood alcohol', unit: 'mg/dL', type: 'number', required: true, hint: 'Legal driving limit India: <30 mg/dL' },
    ],
  },
  {
    id: 'drug_abuse_panel',
    name: 'Drug Abuse Panel (Urine)',
    category: 'toxicology',
    description: 'Common drugs of abuse — urine screening',
    order: 501,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'cannabis_thc', label: 'Cannabis (THC)', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'cocaine', label: 'Cocaine', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'opiates', label: 'Opiates (Morphine/Heroin)', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'amphetamines', label: 'Amphetamines', type: 'select', required: true, options: ['Negative', 'Positive'] },
      { id: 'methamphetamines', label: 'Methamphetamines', type: 'select', options: ['Negative', 'Positive'] },
      { id: 'benzodiazepines', label: 'Benzodiazepines', type: 'select', options: ['Negative', 'Positive'] },
      { id: 'barbiturates', label: 'Barbiturates', type: 'select', options: ['Negative', 'Positive'] },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
  {
    id: 'heavy_metal_screening',
    name: 'Heavy Metal Screening',
    category: 'toxicology',
    description: 'Lead, mercury, arsenic, cadmium',
    order: 502,
    default_price_paise: 400000, // ₹4000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'lead', label: 'Lead', unit: 'µg/dL', type: 'number', normalMin: 0, normalMax: 5 },
      { id: 'mercury', label: 'Mercury', unit: 'µg/L', type: 'number', normalMin: 0, normalMax: 10 },
      { id: 'arsenic', label: 'Arsenic', unit: 'µg/L', type: 'number', normalMin: 0, normalMax: 12 },
      { id: 'cadmium', label: 'Cadmium', unit: 'µg/L', type: 'number', normalMin: 0, normalMax: 5 },
    ],
  },
  {
    id: 'tdm',
    name: 'Therapeutic Drug Monitoring',
    category: 'toxicology',
    description: 'Specify drug being monitored',
    order: 503,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    fields: [
      { id: 'drug_name', label: 'Drug being monitored', type: 'text', required: true, placeholder: 'e.g., Phenytoin, Lithium, Cyclosporine, Tacrolimus' },
      { id: 'level', label: 'Serum level', type: 'text', required: true, placeholder: 'with units' },
      { id: 'reference_range', label: 'Therapeutic range', type: 'text', placeholder: 'lab-specific' },
      { id: 'time_since_last_dose', label: 'Time since last dose', type: 'text' },
      { id: 'interpretation', label: 'Interpretation', type: 'select', options: ['Sub-therapeutic', 'Therapeutic', 'Toxic'] },
      { id: 'comment', label: 'Comment', type: 'longtext' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// PANELS / BUNDLES
// ═══════════════════════════════════════════════════════════════════
// Panels are bundles — selecting one auto-adds all component tests.
// The bundle_form_ids field lists the included form_ids. The cart UI
// expands a panel into its components on add.

const PANELS: FormDefinition[] = [
  {
    id: 'panel_dengue',
    name: 'Dengue Panel',
    category: 'panel',
    description: 'NS1 + IgM/IgG + Platelet count',
    order: 600,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['dengue_ns1', 'dengue_igm_igg', 'platelet_count'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext', hint: 'NS1 Antigen, IgM/IgG Antibody, Platelet Count. Each test result entered separately.' },
    ],
  },
  {
    id: 'panel_malaria',
    name: 'Malaria Panel',
    category: 'panel',
    description: 'Antigen + Smear + CBC',
    order: 601,
    default_price_paise: 90000, // ₹900
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['malaria_antigen', 'malaria_smear', 'cbc'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_typhoid',
    name: 'Typhoid Panel',
    category: 'panel',
    description: 'Widal + TyphiDot + CBC',
    order: 602,
    default_price_paise: 110000, // ₹1100
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['widal', 'typhidot', 'cbc'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_viral_fever',
    name: 'Viral Fever Panel',
    category: 'panel',
    description: 'Dengue + Malaria + Typhoid + Chikungunya basics',
    order: 603,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['dengue_ns1', 'malaria_antigen', 'widal', 'chikungunya_igm', 'cbc', 'esr'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_diabetes',
    name: 'Diabetes Package',
    category: 'panel',
    description: 'FBS + PPBS + HbA1c + Lipid + KFT',
    order: 604,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['fasting_blood_sugar', 'pp_blood_sugar', 'hba1c', 'lipid_profile', 'kft_extended'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_cardiac_risk',
    name: 'Cardiac Risk Package',
    category: 'panel',
    description: 'Lipid + hs-CRP + Homocysteine + ECG markers',
    order: 605,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['lipid_profile', 'hs_crp', 'homocysteine', 'fasting_blood_sugar', 'hba1c'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_obesity_profile',
    name: 'Obesity Profile',
    category: 'panel',
    description: 'Lipid + Glucose + Thyroid + Liver + Kidney',
    order: 606,
    default_price_paise: 250000, // ₹2500
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['lipid_profile', 'fasting_blood_sugar', 'hba1c', 'thyroid_full', 'lft_extended', 'kft_extended'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_liver',
    name: 'Liver Package',
    category: 'panel',
    description: 'LFT extended + Hepatitis B/C + GGT',
    order: 607,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['lft_extended', 'hbsag', 'hcv_antibody'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_kidney',
    name: 'Kidney Package',
    category: 'panel',
    description: 'KFT extended + Urine routine + Electrolytes',
    order: 608,
    default_price_paise: 130000, // ₹1300
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['kft_extended', 'urine_routine', 'electrolytes'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_thyroid',
    name: 'Thyroid Package',
    category: 'panel',
    description: 'Thyroid Full + Anti-TPO',
    order: 609,
    default_price_paise: 100000, // ₹1000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['thyroid_full', 'anti_tpo'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_basic_health',
    name: 'Basic Health Check',
    category: 'panel',
    description: 'CBC + FBS + Lipid + LFT + KFT + Urine + TSH',
    order: 610,
    default_price_paise: 200000, // ₹2000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['cbc', 'fasting_blood_sugar', 'lipid_profile', 'liver_function', 'kidney_function', 'urine_routine', 'thyroid_tsh'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_executive',
    name: 'Executive Health Package',
    category: 'panel',
    description: 'Comprehensive — adds cardiac and vitamin markers',
    order: 611,
    default_price_paise: 600000, // ₹6000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['cbc', 'fasting_blood_sugar', 'hba1c', 'lipid_profile', 'lft_extended', 'kft_extended', 'urine_routine', 'thyroid_full', 'vitamin_d', 'vitamin_b12', 'hs_crp'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_full_body',
    name: 'Full Body Checkup',
    category: 'panel',
    description: 'Most comprehensive — premium package',
    order: 612,
    default_price_paise: 800000, // ₹8000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['cbc', 'hemogram', 'fasting_blood_sugar', 'pp_blood_sugar', 'hba1c', 'lipid_profile', 'lft_extended', 'kft_extended', 'urine_routine', 'thyroid_full', 'anti_tpo', 'vitamin_d', 'vitamin_b12', 'iron_studies', 'hs_crp', 'esr'],
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
  {
    id: 'panel_senior_citizen',
    name: 'Senior Citizen Package',
    category: 'panel',
    description: 'Age-focused — bone, cardiac, kidney emphasis',
    order: 613,
    default_price_paise: 500000, // ₹5000
    source: 'rakshsetu_v1_starter',
    bundle_form_ids: ['cbc', 'fasting_blood_sugar', 'hba1c', 'lipid_profile', 'lft_extended', 'kft_extended', 'urine_routine', 'thyroid_tsh', 'vitamin_d', 'vitamin_b12', 'pth', 'psa'],
    notes: 'PSA included for male patients. Lab can drop and add CA-125 for female patients.',
    fields: [
      { id: 'panel_note', label: 'Panel includes', type: 'longtext' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// FINAL EXPORT — extended forms aggregated for spread into STANDARD_FORMS
// ═══════════════════════════════════════════════════════════════════

export const EXTENDED_FORMS: FormDefinition[] = [
  ...HEMATOLOGY,
  ...DIABETES_EXTENDED,
  ...KIDNEY,
  ...LIVER,
  ...LIPID_EXTENDED,
  ...THYROID_EXTENDED,
  ...REPRODUCTIVE_HORMONES,
  ...OTHER_HORMONES,
  ...VITAMIN_EXTENDED,
  ...INFECTIOUS_FEVER,
  ...VIRAL,
  ...TUBERCULOSIS,
  ...CARDIOLOGY_ADVANCED,
  ...COAGULATION,
  ...AUTOIMMUNE,
  ...ALLERGY,
  ...TUMOR_MARKERS,
  ...GENETIC,
  ...BLOOD_BANK,
  ...TOXICOLOGY,
  ...PANELS,
];
