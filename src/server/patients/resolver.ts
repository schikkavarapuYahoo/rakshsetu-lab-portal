import 'server-only';

/**
 * Patient resolution — finds or creates a `users/{uid}` doc for a
 * patient identified by phone number.
 *
 * Extracted from /api/reports route in Round 9 Session D so that the
 * batch-submit endpoint can resolve a patient ONCE and reuse the
 * reference across N reports in a batch.
 *
 * Resolution order:
 *   1. Firestore users where phone_number == candidate (try multiple
 *      format candidates to handle +91xxx vs digits-only vs 91xxx)
 *   2. Firebase Auth getUserByPhoneNumber fallback (for users who
 *      signed up via OTP but never had phone_number written to their
 *      Firestore doc)
 *   3. Placeholder creation (placeholder: true, marked for merge on
 *      mobile-app onboarding)
 *
 * The function is idempotent: calling it twice for the same phone
 * returns the same DocumentReference.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/server/firebase-admin';

export interface PatientInput {
  /** Already-normalized phone (e.g., +91 + 10 digits) */
  phone: string;
  name: string;
  dob?: string | null;
  gender?: string;
  age?: number | null;
}

export interface ResolvedPatient {
  ref: FirebaseFirestore.DocumentReference;
  isNew: boolean;
}

export async function resolveOrCreatePatient(
  patient: PatientInput,
  labId: string,
): Promise<ResolvedPatient> {
  const db = adminDb();
  const phone = patient.phone;

  // Step 1: Firestore phone_number field lookup with format candidates.
  const phoneCandidates: string[] = [phone];
  const digitsOnly = phone.replace(/\D/g, '');
  if (!phoneCandidates.includes(digitsOnly)) phoneCandidates.push(digitsOnly);
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    phoneCandidates.push(digitsOnly.slice(2));
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    phoneCandidates.push(digitsOnly.slice(1));
  }

  type ExistingShape = {
    empty: boolean;
    docs: Array<{
      id: string;
      ref: FirebaseFirestore.DocumentReference;
      data: () => FirebaseFirestore.DocumentData | undefined;
    }>;
  };
  let existing: ExistingShape = { empty: true, docs: [] };
  for (const candidate of phoneCandidates) {
    const snap = await db
      .collection('users')
      .where('phone_number', '==', candidate)
      .limit(1)
      .get();
    if (!snap.empty) {
      existing = snap as unknown as ExistingShape;
      break;
    }
  }

  // Step 2: Firebase Auth fallback
  if (existing.empty) {
    const auth = adminAuth();
    const authCandidates: string[] = [phone];
    if (digitsOnly.length === 10) {
      if (!authCandidates.includes(`+1${digitsOnly}`))
        authCandidates.push(`+1${digitsOnly}`);
    }
    for (const candidate of authCandidates) {
      try {
        const authUser = await auth.getUserByPhoneNumber(candidate);
        if (authUser) {
          const userDoc = await db.collection('users').doc(authUser.uid).get();
          if (userDoc.exists) {
            existing = {
              empty: false,
              docs: [
                {
                  id: userDoc.id,
                  ref: userDoc.ref,
                  data: () => userDoc.data(),
                },
              ],
            };
            await userDoc.ref.update({ phone_number: candidate }).catch(() => {});
            break;
          }
        }
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (
          err.code !== 'auth/user-not-found' &&
          err.code !== 'auth/invalid-phone-number'
        ) {
          console.warn(`Auth phone lookup failed for ${candidate}:`, err.message);
        }
      }
    }
  }

  let patientUserRef: FirebaseFirestore.DocumentReference;
  let isNew = false;

  if (!existing.empty) {
    patientUserRef = existing.docs[0].ref;
    const cur = existing.docs[0].data() || {};
    const updates: Record<string, unknown> = {};
    if (!cur.display_name && patient.name) updates.display_name = patient.name;
    if (Object.keys(updates).length > 0) await patientUserRef.update(updates);
  } else {
    const newRef = db.collection('users').doc();
    await newRef.set({
      phone_number: phone,
      display_name: patient.name,
      gender: patient.gender || 'unspecified',
      dob: patient.dob || null,
      placeholder: true,
      created_via: 'lab',
      created_by_lab_id: labId,
      created_at: FieldValue.serverTimestamp(),
      linked_labs: [labId],
    });
    patientUserRef = newRef;
    isNew = true;
  }

  // Always ensure linked_labs contains this lab. Idempotent — arrayUnion
  // is a no-op if already present.
  await patientUserRef.update({
    linked_labs: FieldValue.arrayUnion(labId),
  });

  return { ref: patientUserRef, isNew };
}
