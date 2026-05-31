/**
 * Master test library — curated baseline of common Indian-lab tests.
 *
 * This module is read-only and bundled with the app. Labs do NOT edit it
 * directly. Instead, each lab maintains its own catalog (`useLabCatalogStore`)
 * which is seeded from this library and can then be customised: enable a
 * subset, override units / reference ranges to match the lab's analyzer,
 * set per-lab pricing, or add fully custom tests not present here.
 *
 * When updating this file (us, not labs):
 *  - Treat `code` as a stable identifier — once shipped, do not rename it,
 *    since lab catalog rows reference it via `masterCode`.
 *  - Adding new tests is safe.
 *  - Removing or renaming a test will require a migration in the lab
 *    catalog store.
 *  - Reference ranges here are clinical defaults (CLSI / common Indian
 *    practice). Labs are expected to confirm with their own analyzer.
 */

export type TestCategory =
  | "Hematology"
  | "Biochemistry"
  | "Hormone"
  | "Vitamin"
  | "Urinalysis"
  | "Serology"
  | "Microbiology"
  | "Other";

/**
 * Sample types a small lab routinely collects. Matters for the technician
 * because each type has different draw / storage / prep rules.
 */
export type SampleType =
  | "Whole Blood"
  | "Serum"
  | "Plasma"
  | "Urine"
  | "Swab"
  | "Stool"
  | "Sputum"
  | "Other";

/**
 * Standard blood-collection tube colour coding (CLSI / common Indian
 * practice). The colour maps to the additive inside the tube, so picking
 * the wrong one means the sample is unusable and the patient has to be
 * stuck again. Surfacing this at test-selection time prevents re-draws.
 * `None` is used for non-blood samples (urine, swab, etc.).
 */
export type TubeColor =
  | "Lavender (EDTA)"
  | "Red (Clot Activator)"
  | "Gold / Tiger (SST)"
  | "Green (Heparin)"
  | "Blue (Citrate)"
  | "Gray (Fluoride)"
  | "None / Container"
  | "Other";

export const SAMPLE_TYPES: SampleType[] = [
  "Whole Blood",
  "Serum",
  "Plasma",
  "Urine",
  "Swab",
  "Stool",
  "Sputum",
  "Other",
];

export const TUBE_COLORS: TubeColor[] = [
  "Lavender (EDTA)",
  "Red (Clot Activator)",
  "Gold / Tiger (SST)",
  "Green (Heparin)",
  "Blue (Citrate)",
  "Gray (Fluoride)",
  "None / Container",
  "Other",
];

export interface MasterTestParameter {
  parameter: string;
  unit?: string;
  /** Default clinical reference range — labs may override. */
  referenceRange?: string;
}

export interface MasterTest {
  /** Stable identifier. Do not rename in-place once shipped. */
  code: string;
  name: string;
  category: TestCategory;
  /** Short description for the test catalog browser. */
  description?: string;
  parameters: MasterTestParameter[];
  /**
   * Expected turnaround time in minutes — how long after sample collection
   * the technician should be able to enter results. Drives the dashboard
   * "due now" reminders. Labs can override per-test in the lab catalog.
   * Defaults here are typical Indian small-lab timings (in-house analyzers
   * for routine tests; longer for sent-out / specialised assays).
   */
  turnaroundMinutes: number;
  /** What the technician should physically collect from the patient. */
  sampleType: SampleType;
  /**
   * Tube to draw blood into, if applicable. `None / Container` for
   * non-blood samples (urine cup, swab tube, etc).
   */
  tubeColor: TubeColor;
  /**
   * Free-form instructions the receptionist tells the patient at the
   * counter — fasting requirements, restrictions, special prep. Empty
   * string means "no special prep" (kept as empty string rather than
   * undefined so the form has a single shape).
   */
  patientPrep: string;
}

export const MASTER_TEST_LIBRARY: MasterTest[] = [
  {
    code: "CBC",
    name: "Complete Blood Count",
    category: "Hematology",
    description: "Hemoglobin, RBC, WBC, platelets and hematocrit.",
    turnaroundMinutes: 30,
    sampleType: "Whole Blood",
    tubeColor: "Lavender (EDTA)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Hemoglobin", unit: "g/dL", referenceRange: "13.0 - 17.0" },
      { parameter: "RBC Count", unit: "10^6/µL", referenceRange: "4.5 - 5.5" },
      { parameter: "WBC Count", unit: "10^3/µL", referenceRange: "4.0 - 11.0" },
      { parameter: "Platelet Count", unit: "10^3/µL", referenceRange: "150 - 410" },
      { parameter: "Hematocrit", unit: "%", referenceRange: "40 - 50" },
    ],
  },
  {
    code: "LIPID",
    name: "Lipid Panel",
    category: "Biochemistry",
    description: "Cholesterol fractions and triglycerides.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Fasting 9–12 hours required. Water is OK; no food, juice, tea, or coffee with sugar.",
    parameters: [
      { parameter: "Total Cholesterol", unit: "mg/dL", referenceRange: "< 200" },
      { parameter: "HDL Cholesterol", unit: "mg/dL", referenceRange: "> 40" },
      { parameter: "LDL Cholesterol", unit: "mg/dL", referenceRange: "< 100" },
      { parameter: "Triglycerides", unit: "mg/dL", referenceRange: "< 150" },
      // Derived rows — auto-computed in the inline editor as the
      // technician enters Total / HDL / Triglycerides. VLDL = TG/5;
      // ratio = TC/HDL. Both invalid above TG 400; tech can overwrite.
      { parameter: "VLDL Cholesterol", unit: "mg/dL", referenceRange: "< 30" },
      { parameter: "Total / HDL Ratio", unit: "", referenceRange: "< 4.5" },
    ],
  },
  {
    code: "HBA1C",
    name: "HbA1c",
    category: "Biochemistry",
    description: "Glycated hemoglobin for diabetes monitoring.",
    turnaroundMinutes: 120,
    sampleType: "Whole Blood",
    tubeColor: "Lavender (EDTA)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "HbA1c", unit: "%", referenceRange: "< 5.7" },
      { parameter: "Estimated Avg Glucose", unit: "mg/dL", referenceRange: "< 117" },
    ],
  },
  {
    code: "TSH-T3-T4",
    name: "Thyroid Panel",
    category: "Hormone",
    description: "TSH, Free T3, Free T4.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Preferably morning sample. No fasting required, but consistent timing helps when monitoring.",
    parameters: [
      { parameter: "TSH", unit: "µIU/mL", referenceRange: "0.4 - 4.0" },
      { parameter: "Free T3", unit: "pg/mL", referenceRange: "2.0 - 4.4" },
      { parameter: "Free T4", unit: "ng/dL", referenceRange: "0.8 - 1.8" },
    ],
  },
  {
    code: "LFT",
    name: "Liver Function Test",
    category: "Biochemistry",
    description: "Liver enzymes and bilirubin.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "Avoid alcohol for 24 hours. No fasting required.",
    parameters: [
      { parameter: "SGOT (AST)", unit: "U/L", referenceRange: "< 40" },
      { parameter: "SGPT (ALT)", unit: "U/L", referenceRange: "< 40" },
      { parameter: "Total Bilirubin", unit: "mg/dL", referenceRange: "0.2 - 1.2" },
      { parameter: "Direct Bilirubin", unit: "mg/dL", referenceRange: "0.0 - 0.3" },
      // Derived — Indirect Bilirubin = Total − Direct. Auto-filled by
      // the inline editor as the tech enters the two measured rows.
      { parameter: "Indirect Bilirubin", unit: "mg/dL", referenceRange: "0.2 - 0.9" },
      { parameter: "Alkaline Phosphatase", unit: "U/L", referenceRange: "40 - 130" },
      { parameter: "Total Protein", unit: "g/dL", referenceRange: "6.0 - 8.3" },
      { parameter: "Albumin", unit: "g/dL", referenceRange: "3.5 - 5.5" },
      // Derived — Globulin = Total Protein − Albumin; A/G = Albumin / Globulin.
      { parameter: "Globulin", unit: "g/dL", referenceRange: "2.0 - 3.5" },
      { parameter: "A / G Ratio", unit: "", referenceRange: "1.1 - 2.5" },
    ],
  },
  {
    code: "KFT",
    name: "Kidney Function Test",
    category: "Biochemistry",
    description: "Creatinine, urea, uric acid.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "No fasting required. Avoid red meat in the 24 hours before testing.",
    parameters: [
      { parameter: "Creatinine", unit: "mg/dL", referenceRange: "0.7 - 1.3" },
      { parameter: "Urea", unit: "mg/dL", referenceRange: "15 - 45" },
      { parameter: "Uric Acid", unit: "mg/dL", referenceRange: "3.4 - 7.0" },
    ],
  },
  {
    code: "URINE-R",
    name: "Urine Routine",
    category: "Urinalysis",
    description: "Routine urine analysis: pH, specific gravity, protein, glucose.",
    turnaroundMinutes: 30,
    sampleType: "Urine",
    tubeColor: "None / Container",
    patientPrep:
      "Midstream sample preferred. First-morning urine is best where possible.",
    parameters: [
      { parameter: "pH", referenceRange: "5.0 - 8.0" },
      { parameter: "Specific Gravity", referenceRange: "1.005 - 1.030" },
      { parameter: "Protein", referenceRange: "Negative" },
      { parameter: "Glucose", referenceRange: "Negative" },
    ],
  },
  {
    code: "ESR",
    name: "ESR",
    category: "Hematology",
    description: "Erythrocyte sedimentation rate.",
    turnaroundMinutes: 60,
    sampleType: "Whole Blood",
    tubeColor: "Lavender (EDTA)",
    patientPrep: "No special preparation required.",
    parameters: [{ parameter: "ESR", unit: "mm/hr", referenceRange: "< 20" }],
  },
  {
    code: "VIT-D",
    name: "Vitamin D",
    category: "Vitamin",
    description: "25-hydroxy Vitamin D level.",
    // Often sent-out / batch-run on a 24h cycle.
    turnaroundMinutes: 1440,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "25-OH Vitamin D", unit: "ng/mL", referenceRange: "30 - 100" },
    ],
  },
  {
    code: "VIT-B12",
    name: "Vitamin B12",
    category: "Vitamin",
    description: "Serum Vitamin B12 level.",
    turnaroundMinutes: 1440,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Fasting preferred (4 hours minimum). Avoid B12 supplements for 24 hours before.",
    parameters: [
      { parameter: "Vitamin B12", unit: "pg/mL", referenceRange: "200 - 900" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Glucose / Diabetes
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "FBS",
    name: "Fasting Blood Sugar",
    category: "Biochemistry",
    description: "Plasma glucose after 8–12 h overnight fast.",
    turnaroundMinutes: 30,
    sampleType: "Plasma",
    tubeColor: "Gray (Fluoride)",
    patientPrep:
      "Fasting 8–12 hours required. Water OK; no food, juice, coffee, or chewing gum.",
    parameters: [
      { parameter: "Fasting Glucose", unit: "mg/dL", referenceRange: "70 - 100" },
    ],
  },
  {
    code: "PPBS",
    name: "Post-Prandial Blood Sugar",
    category: "Biochemistry",
    description: "Plasma glucose exactly 2 h after a measured meal.",
    turnaroundMinutes: 30,
    sampleType: "Plasma",
    tubeColor: "Gray (Fluoride)",
    patientPrep:
      "Eat a normal meal, note the time. Sample is drawn exactly 2 hours after the first bite. No additional food until the sample is taken.",
    parameters: [
      { parameter: "2-hr Post-Prandial Glucose", unit: "mg/dL", referenceRange: "< 140" },
    ],
  },
  {
    code: "RBS",
    name: "Random Blood Sugar",
    category: "Biochemistry",
    description: "Plasma glucose at any time, regardless of last meal.",
    turnaroundMinutes: 30,
    sampleType: "Plasma",
    tubeColor: "Gray (Fluoride)",
    patientPrep: "No fasting required. Note time of last meal on the form.",
    parameters: [
      { parameter: "Random Glucose", unit: "mg/dL", referenceRange: "< 140" },
    ],
  },
  {
    code: "OGTT",
    name: "Oral Glucose Tolerance Test",
    category: "Biochemistry",
    description: "Glucose at 0, 1 h, and 2 h after a 75 g glucose load.",
    turnaroundMinutes: 180,
    sampleType: "Plasma",
    tubeColor: "Gray (Fluoride)",
    patientPrep:
      "Fasting 8–12 hours required. Plan to stay in the lab for ~2.5 hours after the first draw. Avoid smoking and exercise during the test.",
    parameters: [
      { parameter: "Fasting Glucose", unit: "mg/dL", referenceRange: "70 - 100" },
      { parameter: "1-hr Glucose", unit: "mg/dL", referenceRange: "< 180" },
      { parameter: "2-hr Glucose", unit: "mg/dL", referenceRange: "< 140" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Coagulation + Blood bank
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "BG-RH",
    name: "Blood Group & Rh Typing",
    category: "Hematology",
    description: "ABO group + Rh(D) typing.",
    turnaroundMinutes: 30,
    sampleType: "Whole Blood",
    tubeColor: "Lavender (EDTA)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "ABO Group", referenceRange: "A / B / AB / O" },
      { parameter: "Rh Typing", referenceRange: "Positive / Negative" },
    ],
  },
  {
    code: "PT-INR",
    name: "Prothrombin Time (PT/INR)",
    category: "Hematology",
    description: "Extrinsic coagulation pathway monitoring.",
    turnaroundMinutes: 60,
    sampleType: "Plasma",
    tubeColor: "Blue (Citrate)",
    patientPrep:
      "No special prep. Tube MUST be filled to the mark — under-filled samples will be rejected.",
    parameters: [
      { parameter: "PT", unit: "seconds", referenceRange: "11 - 13.5" },
      { parameter: "INR", referenceRange: "0.8 - 1.2" },
    ],
  },
  {
    code: "APTT",
    name: "Activated Partial Thromboplastin Time",
    category: "Hematology",
    description: "Intrinsic coagulation pathway monitoring.",
    turnaroundMinutes: 60,
    sampleType: "Plasma",
    tubeColor: "Blue (Citrate)",
    patientPrep:
      "No special prep. Tube must be filled to the mark; ratio of blood to citrate matters.",
    parameters: [
      { parameter: "APTT", unit: "seconds", referenceRange: "25 - 35" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Extended biochemistry
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "CA-SERUM",
    name: "Calcium (Serum)",
    category: "Biochemistry",
    description: "Total serum calcium.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Calcium", unit: "mg/dL", referenceRange: "8.5 - 10.5" },
    ],
  },
  {
    code: "MG-SERUM",
    name: "Magnesium (Serum)",
    category: "Biochemistry",
    description: "Serum magnesium level.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Magnesium", unit: "mg/dL", referenceRange: "1.7 - 2.2" },
    ],
  },
  {
    code: "PHOS",
    name: "Phosphorus (Serum)",
    category: "Biochemistry",
    description: "Serum inorganic phosphorus level.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Fasting preferred (4 h). Levels are highest in the morning.",
    parameters: [
      { parameter: "Phosphorus", unit: "mg/dL", referenceRange: "2.5 - 4.5" },
    ],
  },
  {
    code: "IRON",
    name: "Serum Iron",
    category: "Biochemistry",
    description: "Serum iron level (often ordered with Ferritin and TIBC).",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Fasting preferred. Avoid iron supplements for 24 hours before the test.",
    parameters: [
      { parameter: "Serum Iron", unit: "µg/dL", referenceRange: "60 - 170" },
    ],
  },
  {
    code: "FERRITIN",
    name: "Ferritin",
    category: "Biochemistry",
    description: "Iron storage protein — sensitive marker of body iron stores.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Ferritin", unit: "ng/mL", referenceRange: "30 - 400" },
    ],
  },
  {
    code: "AMYLASE",
    name: "Amylase",
    category: "Biochemistry",
    description: "Serum amylase — pancreatic / salivary marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Amylase", unit: "U/L", referenceRange: "30 - 110" },
    ],
  },
  {
    code: "LIPASE",
    name: "Lipase",
    category: "Biochemistry",
    description: "Serum lipase — more specific pancreatic marker than amylase.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Lipase", unit: "U/L", referenceRange: "10 - 60" },
    ],
  },
  {
    code: "ALBUMIN",
    name: "Serum Albumin",
    category: "Biochemistry",
    description: "Serum albumin — nutritional / hepatic status marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Albumin", unit: "g/dL", referenceRange: "3.5 - 5.0" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Hormone / Endocrine
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "BETA-HCG",
    name: "Beta-HCG (Pregnancy)",
    category: "Hormone",
    description:
      "Quantitative beta human chorionic gonadotropin — confirms / monitors pregnancy.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "No special prep. Note the patient's last menstrual period (LMP) date on the form.",
    parameters: [
      { parameter: "Beta-HCG", unit: "mIU/mL", referenceRange: "< 5 (non-pregnant)" },
    ],
  },
  {
    code: "PROLACTIN",
    name: "Prolactin",
    category: "Hormone",
    description: "Anterior pituitary hormone.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Best drawn 3–4 hours after waking. Avoid stress, exercise, and breast stimulation in the hour before. Note the time of draw.",
    parameters: [
      { parameter: "Prolactin", unit: "ng/mL", referenceRange: "4 - 23 (female), 3 - 15 (male)" },
    ],
  },
  {
    code: "LH",
    name: "Luteinizing Hormone (LH)",
    category: "Hormone",
    description: "Gonadotropin — drives ovulation / testicular function.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Note the patient's menstrual cycle day on the form (range depends heavily on phase).",
    parameters: [
      { parameter: "LH", unit: "mIU/mL", referenceRange: "1.7 - 8.6 (follicular)" },
    ],
  },
  {
    code: "FSH",
    name: "Follicle-Stimulating Hormone (FSH)",
    category: "Hormone",
    description: "Gonadotropin — assesses ovarian / testicular reserve.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Note the patient's menstrual cycle day on the form (range depends heavily on phase).",
    parameters: [
      { parameter: "FSH", unit: "mIU/mL", referenceRange: "3.5 - 12.5 (follicular)" },
    ],
  },
  {
    code: "TESTO-TOTAL",
    name: "Total Testosterone",
    category: "Hormone",
    description: "Total serum testosterone (male / female).",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Best drawn in the morning (7–10 AM). Levels are highest then; afternoon results may be misleading.",
    parameters: [
      { parameter: "Total Testosterone", unit: "ng/dL", referenceRange: "240 - 950 (adult male)" },
    ],
  },
  {
    code: "INSULIN-F",
    name: "Insulin (Fasting)",
    category: "Hormone",
    description: "Fasting serum insulin — insulin resistance / hypoglycemia work-up.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Fasting 8–12 hours required. Often drawn alongside fasting glucose for HOMA-IR.",
    parameters: [
      { parameter: "Fasting Insulin", unit: "µIU/mL", referenceRange: "2.6 - 24.9" },
    ],
  },
  {
    code: "CORTISOL-AM",
    name: "Cortisol (Morning)",
    category: "Hormone",
    description: "8 AM serum cortisol — adrenal function.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Draw between 7 and 9 AM. Patient should be at rest for 30 minutes before draw. Note time of draw on the form.",
    parameters: [
      { parameter: "Cortisol (AM)", unit: "µg/dL", referenceRange: "5 - 25" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Cardiac markers
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "TROP-I",
    name: "Troponin I",
    category: "Biochemistry",
    description: "Cardiac-specific troponin I — acute MI marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "No fasting required. Note time of chest pain onset on the form — kinetics matter.",
    parameters: [
      { parameter: "Troponin I", unit: "ng/mL", referenceRange: "< 0.04" },
    ],
  },
  {
    code: "CK-MB",
    name: "CK-MB",
    category: "Biochemistry",
    description: "Creatine kinase MB isoenzyme — cardiac marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required. Often paired with Troponin I.",
    parameters: [
      { parameter: "CK-MB", unit: "ng/mL", referenceRange: "< 5" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Serology / Infectious disease
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "WIDAL",
    name: "Widal Test",
    category: "Serology",
    description: "Slide agglutination for typhoid (Salmonella typhi / paratyphi).",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Red (Clot Activator)",
    patientPrep:
      "No fasting required. Best after 7+ days of fever. Note duration of fever on the form.",
    parameters: [
      { parameter: "S. Typhi O", referenceRange: "< 1:80" },
      { parameter: "S. Typhi H", referenceRange: "< 1:160" },
      { parameter: "S. Paratyphi AH", referenceRange: "< 1:80" },
      { parameter: "S. Paratyphi BH", referenceRange: "< 1:80" },
    ],
  },
  {
    code: "DENGUE-NS1",
    name: "Dengue NS1 Antigen",
    category: "Serology",
    description: "Early dengue marker — useful in first 5 days of fever.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Red (Clot Activator)",
    patientPrep:
      "No fasting required. Most sensitive in days 1–5 of fever; note fever onset on the form.",
    parameters: [
      { parameter: "Dengue NS1 Antigen", referenceRange: "Negative" },
    ],
  },
  {
    code: "MALARIA-AG",
    name: "Malaria Parasite (Antigen)",
    category: "Serology",
    description: "Rapid antigen test for P. vivax / P. falciparum.",
    turnaroundMinutes: 30,
    sampleType: "Whole Blood",
    tubeColor: "Lavender (EDTA)",
    patientPrep:
      "Sample preferably during a fever spike — parasitaemia peaks then.",
    parameters: [
      { parameter: "P. falciparum Antigen", referenceRange: "Negative" },
      { parameter: "P. vivax Antigen", referenceRange: "Negative" },
    ],
  },
  {
    code: "HIV",
    name: "HIV I & II Antibody",
    category: "Serology",
    description: "Screening immunoassay for HIV-1 and HIV-2 antibodies.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Red (Clot Activator)",
    patientPrep:
      "No fasting required. Pre-test counselling recommended; results are confidential.",
    parameters: [
      { parameter: "HIV I & II Antibodies", referenceRange: "Non-reactive" },
    ],
  },
  {
    code: "HBSAG",
    name: "Hepatitis B Surface Antigen",
    category: "Serology",
    description: "Screening marker for active Hepatitis B infection.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Red (Clot Activator)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "HBsAg", referenceRange: "Non-reactive" },
    ],
  },
  {
    code: "ANTI-HCV",
    name: "Anti-HCV (Hepatitis C)",
    category: "Serology",
    description: "Screening antibody to Hepatitis C virus.",
    turnaroundMinutes: 120,
    sampleType: "Serum",
    tubeColor: "Red (Clot Activator)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "Anti-HCV", referenceRange: "Non-reactive" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Inflammation + autoimmune
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "CRP",
    name: "C-Reactive Protein",
    category: "Biochemistry",
    description: "Acute-phase inflammation marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "CRP", unit: "mg/L", referenceRange: "< 10" },
    ],
  },
  {
    code: "ASO",
    name: "ASO Titre",
    category: "Serology",
    description: "Anti-streptolysin O — post-streptococcal infection marker.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "ASO", unit: "IU/mL", referenceRange: "< 200" },
    ],
  },
  {
    code: "RA-FACTOR",
    name: "Rheumatoid Factor",
    category: "Serology",
    description: "Autoantibody screen for rheumatoid arthritis.",
    turnaroundMinutes: 60,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep: "No fasting required.",
    parameters: [
      { parameter: "RA Factor", unit: "IU/mL", referenceRange: "< 14" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Cancer markers
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "PSA-TOTAL",
    name: "Total PSA",
    category: "Hormone",
    description: "Total prostate-specific antigen — prostate cancer screen / monitoring.",
    turnaroundMinutes: 240,
    sampleType: "Serum",
    tubeColor: "Gold / Tiger (SST)",
    patientPrep:
      "Avoid ejaculation, cycling, prostate exam (DRE), or catheterisation for 48 hours before. Otherwise no fasting required.",
    parameters: [
      { parameter: "Total PSA", unit: "ng/mL", referenceRange: "< 4.0 (age-adjusted)" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  //  Microbiology
  // ──────────────────────────────────────────────────────────────────────
  {
    code: "URINE-CULT",
    name: "Urine Culture & Sensitivity",
    category: "Microbiology",
    description:
      "Bacterial culture with antibiotic susceptibility — typically 48–72 h.",
    // 48h — cultures genuinely take this long; the dashboard will show a
    // long due-by but that's accurate.
    turnaroundMinutes: 2880,
    sampleType: "Urine",
    tubeColor: "None / Container",
    patientPrep:
      "Clean-catch midstream sample. First-morning urine preferred. Hand the patient a sterile container and explain the clean-catch technique.",
    parameters: [
      { parameter: "Organism Isolated", referenceRange: "No growth" },
      { parameter: "Colony Count", unit: "CFU/mL", referenceRange: "< 10,000" },
      { parameter: "Antibiotic Sensitivity", referenceRange: "Sensitive / Resistant" },
    ],
  },
  {
    code: "STOOL-R",
    name: "Stool Routine",
    category: "Microbiology",
    description: "Macro + microscopic examination of stool.",
    turnaroundMinutes: 60,
    sampleType: "Stool",
    tubeColor: "None / Container",
    patientPrep:
      "Fresh sample in a clean container; ideally examined within 1 hour. No barium / oily laxatives in the previous 7 days.",
    parameters: [
      { parameter: "Consistency", referenceRange: "Formed" },
      { parameter: "Colour", referenceRange: "Brown" },
      { parameter: "Ova / Cysts", referenceRange: "Not seen" },
      { parameter: "Pus Cells", referenceRange: "Occasional" },
      { parameter: "RBC", referenceRange: "Not seen" },
    ],
  },
  {
    code: "STOOL-OB",
    name: "Stool Occult Blood",
    category: "Microbiology",
    description: "Faecal occult blood — GI bleed / cancer screen.",
    turnaroundMinutes: 60,
    sampleType: "Stool",
    tubeColor: "None / Container",
    patientPrep:
      "Avoid red meat, raw vegetables, vitamin C, iron supplements and NSAIDs for 3 days before. Bleeding gums or menstruation can cause false positives.",
    parameters: [
      { parameter: "Occult Blood", referenceRange: "Negative" },
    ],
  },
];

export const MASTER_TEST_BY_CODE: Record<string, MasterTest> = Object.fromEntries(
  MASTER_TEST_LIBRARY.map((t) => [t.code, t]),
);
