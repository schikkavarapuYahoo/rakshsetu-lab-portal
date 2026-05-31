/**
 * Draft batch — represents a multi-test report being assembled by a
 * technician. Persisted to Firestore so technicians can step away
 * mid-flow and resume.
 *
 * Lifecycle:
 *
 *   1. Technician opens /report/new-batch → reads any existing draft
 *      from labs/{labId}/draft_batches/{labCode} (one draft per lab,
 *      not per technician — labs share one draft because Lab user
 *      sessions don't have a per-staff identity yet)
 *   2. Tech enters patient details → PUT updates draft.patient
 *   3. Tech adds tests to cart → PUT updates draft.tests
 *   4. Tech goes to Step 3, fills values → PUT updates draft.tests[i].values
 *   5. Tech clicks "Submit" → server materializes draft into N
 *      lab_reports docs (one per test, all linked by batch_id),
 *      then DELETEs the draft
 *   6. Tech can also explicitly DELETE to discard
 *
 * Draft is namespaced by labId because the lab-portal session
 * doesn't yet support per-staff identity (Session F adds that).
 * Once Session F lands, switch the path to
 * labs/{labId}/staff/{staffId}/draft_batch.
 *
 * The draft is intentionally NOT a top-level collection — keeping
 * it under the lab makes Firestore rules simple (only lab members
 * can read/write their own lab's drafts).
 */

import type { Timestamp } from 'firebase-admin/firestore';

export type ReferralSource = 'walk_in' | 'doctor';
export type FastingStatus =
  | 'fasted'
  | 'non_fasted'
  | 'random'
  | 'post_prandial';
export type PregnancyStatus = 'no' | 'yes' | 'unknown';

export interface DraftPatient {
  name: string;
  phone: string;
  email: string | null;
  dob: string | null;
  age: number | null;
  sex: 'M' | 'F' | 'O' | null;

  height_cm: number | null;
  weight_kg: number | null;
  pregnancy_status: PregnancyStatus | null;
  fasting_status: FastingStatus | null;

  referral_source: ReferralSource;

  referring_doctor: string | null;
  referring_doctor_phone: string | null;
  referring_doctor_specialty: string | null;
  referring_doctor_reg_no: string | null;
  hospital_name: string | null;
  hospital_phone: string | null;

  patient_address: string | null;
  city: string | null;
  pincode: string | null;
  reason_for_test: string | null;
  collected_at_home: boolean;

  collection_date: string | null;
  sample_id: string | null;
}

/** A test added to the cart in Step 2. */
export interface DraftTest {
  /** form_id from the existing STANDARD_FORMS catalog */
  form_id: string;
  /** Snapshot of the form name at time of selection (for display) */
  form_name: string;
  /** Snapshot of category */
  category: string;
  /**
   * Status — drives the cart side-panel pill in Step 3 (Session C).
   * 'partial' means the tech marked the test complete but not all
   * fields had values (Round 9 Session C: forgiving completion).
   */
  status: 'pending' | 'in_progress' | 'completed' | 'partial';
  /** Per-test values entered in Step 3. Empty until Session C. */
  values: Record<string, number | string>;
  /**
   * Snapshot of the lab's effective price for this test at time of
   * cart addition, in paise. Frozen on add to prevent price changes
   * mid-batch from confusing the technician. Optional for backward
   * compat with drafts created before Session C.
   */
  price_paise?: number;
  /**
   * If this entry was added as part of a panel/bundle, the form_id
   * of the panel. Used by the cart UI to remove only panel-added
   * components when the panel is "removed" — preserving any
   * standalone selections the tech made independently.
   *
   * Round 9 Session D2 fix.
   */
  added_by_panel?: string;
  /** When this test was added to the cart */
  added_at: Timestamp | Date;
  /** When this test's values were saved (set in Session C) */
  completed_at: Timestamp | Date | null;
}

/** Top-level draft document */
export interface DraftBatch {
  /** Lab that owns this draft */
  lab_id: string;
  /** Patient details (Step 1) */
  patient: DraftPatient;
  /** Tests added to cart (Step 2) — order matters for navigation */
  tests: DraftTest[];
  /** Last update — server timestamp on every PUT */
  updated_at: Timestamp | Date;
  /** When the draft was first created */
  created_at: Timestamp | Date;
  /** Which step the tech is currently on, for resume UX */
  current_step: 'patient' | 'tests' | 'values' | 'review';
}

/** Build an empty draft for a fresh start. */
export function emptyDraft(labId: string): Omit<DraftBatch, 'created_at' | 'updated_at'> {
  return {
    lab_id: labId,
    patient: {
      name: '',
      phone: '',
      email: null,
      dob: null,
      age: null,
      sex: null,
      height_cm: null,
      weight_kg: null,
      pregnancy_status: null,
      fasting_status: null,
      referral_source: 'walk_in',
      referring_doctor: null,
      referring_doctor_phone: null,
      referring_doctor_specialty: null,
      referring_doctor_reg_no: null,
      hospital_name: null,
      hospital_phone: null,
      patient_address: null,
      city: null,
      pincode: null,
      reason_for_test: null,
      collected_at_home: false,
      collection_date: null,
      sample_id: null,
    },
    tests: [],
    current_step: 'patient',
  };
}

/**
 * Validation: is the patient details section complete enough to
 * proceed to test selection? Phone is the critical field — without
 * it we can't deliver the report. Name is for the PDF header.
 */
export function isPatientStepValid(patient: DraftPatient): boolean {
  if (!patient.name || patient.name.trim().length < 2) return false;
  if (!patient.phone || patient.phone.trim().length < 10) return false;
  if (
    patient.referral_source === 'doctor' &&
    (!patient.referring_doctor || patient.referring_doctor.trim().length < 2)
  ) {
    return false;
  }
  if (patient.pincode && patient.pincode.length > 0 && patient.pincode.length < 6) {
    return false;
  }
  return true;
}

/** Convert phone to last-10-digits canonical form for matching. */
export function normalizePhoneForDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
