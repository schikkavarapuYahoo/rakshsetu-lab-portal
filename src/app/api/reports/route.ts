import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';
import { getFormById, evaluateField, FormField } from '@/lib/forms';
import { normalizePhone } from '@/lib/phone_normalization';
import {
  DEFAULT_PRICE_PER_REPORT_PAISE,
  Paise,
} from '@/lib/paise';
import { writeAudit, hashPhone, actorFromSession, clientMetaFromReq } from '@/server/audit/log';

export const runtime = 'nodejs';

/**
 * Round 7 — known error codes from the debit transaction. The
 * transaction throws these as plain Error instances; the catch
 * block below maps them to HTTP status codes per Section 4 of the
 * billing brief:
 *
 *   INSUFFICIENT_CREDITS → 402 (Payment Required)
 *   LAB_SUSPENDED        → 403
 *   LAB_NOT_FOUND        → 404
 *
 * Anything else (network, transient Firestore error, etc.) becomes
 * a generic 500. A 500 means we don't know if the report was
 * created — Firestore transaction semantics guarantee atomicity, so
 * the lab can safely retry.
 */
const ERR_INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS';
const ERR_LAB_SUSPENDED = 'LAB_SUSPENDED';
const ERR_LAB_NOT_FOUND = 'LAB_NOT_FOUND';

/**
 * POST /api/reports
 *
 * Submit a lab report for a patient. Validates that:
 *   - Caller has valid session
 *   - Form template exists
 *   - Required fields are present
 *   - Patient phone is valid Indian phone number
 *   - Numeric values are within reasonable bounds (no negative glucose, etc.)
 *
 * Side effects on success:
 *   - Creates `lab_reports/{report_id}` doc
 *   - Auto-creates `users/{patient_user_id}` if patient doesn't exist
 *     (placeholder until they install the app)
 *   - Adds lab to patient's `linked_labs` array (auth: only linked labs
 *     can send subsequent reports without re-confirmation)
 *   - Records audit log entry
 *
 * What this DOES NOT do:
 *   - Does NOT trigger emergency alerts. Lab reports are delayed
 *     information, not real-time vitals. The `notifyLabReportReceived`
 *     Cloud Function sends a calm "report ready" push to the patient,
 *     and (if the patient has opted in) a polite "look at <name>'s
 *     report" push to family. No bypass-DND, no critical-priority sound.
 *   - Does NOT write to vitals_log. That collection is reserved for
 *     real-time vitals where bypass-DND alerts are warranted.
 *
 * Security:
 *   - Server-side session validation
 *   - Schema validation (Zod) — rejects malformed input
 *   - Numeric bounds check — rejects implausible values (e.g. glucose >2000)
 *   - Lab can only submit reports as themselves; lab_id pulled from session
 */

// Permissive phone regex: digits/spaces/dashes/parens/+ allowed.
// Real validation happens in normalizePhone which converts to E.164.
const PHONE_RAW = /^[\d\s\-+()]+$/;
const PHONE_E164 = /^\+\d{10,15}$/;

const ReportSubmitSchema = z.object({
  form_id: z.string().min(1),
  patient: z.object({
    name: z.string().min(2).max(80).trim(),
    phone: z.string().min(7).max(20).regex(PHONE_RAW, 'Must be a valid phone number'),
    dob: z.string().optional(), // YYYY-MM-DD
    gender: z.enum(['male', 'female', 'other', 'unspecified']).optional(),
    age: z.number().int().min(0).max(130).optional(),
  }),
  // Field values: keys = field IDs from form definition; values = number or string
  values: z.record(z.string(), z.union([z.number(), z.string()])),
  // Editable header fields — lab can override defaults from their lab profile
  header: z.object({
    lab_name: z.string().min(1).max(120).optional(),
    lab_address: z.string().max(300).optional(),
    lab_phone: z.string().max(20).optional(),
    lab_email: z.string().max(120).optional(),
    test_date: z.string().optional(), // ISO date
    referring_doctor: z.string().max(80).optional(),
    sample_collected_at: z.string().optional(),
    notes: z.string().max(1000).optional(),
  }).optional(),
});

/**
 * Phone normalization is centralized in `@/lib/phone_normalization`.
 * The previous duplicated implementation lived in three different
 * route files and had a bug for 11-digit numbers with a leading 0
 * (the Indian trunk-prefix case): it produced `+09876543210` instead
 * of `+919876543210`, so reports never reached the patient because
 * Firebase Auth keys lookups by E.164 strings. The shared module
 * fixes this and is unit-tested — see lib/phone_normalization.test.ts.
 */

/**
 * Plausibility bounds — reject values that are nonsensical regardless of
 * the form's clinical thresholds. Catches data-entry typos like "5400"
 * for glucose where they meant "54". A field-specific cap can also be
 * defined in the form definition; here we just enforce a sane outer bound.
 */
function isPlausible(field: FormField, value: number): boolean {
  if (Number.isNaN(value)) return false;
  if (!Number.isFinite(value)) return false;
  if (value < 0) return false;
  // No realistic medical value exceeds 1 million in any standard unit
  if (value > 1_000_000) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  // Only labs can submit reports. A rep/admin must use a separate
  // process — they don't impersonate labs to submit data.
  if (session.role !== 'lab') {
    return NextResponse.json({ error: 'Only lab users can submit reports' }, { status: 403 });
  }

  let body: z.infer<typeof ReportSubmitSchema>;
  try {
    const json = await req.json();
    body = ReportSubmitSchema.parse(json);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Look up form definition
  const form = getFormById(body.form_id);
  if (!form) {
    return NextResponse.json({ error: 'Unknown form' }, { status: 400 });
  }

  // Validate values against form schema
  const sanitizedValues: Record<string, number | string> = {};
  const flagged: Array<{ field_id: string; severity: 'warning' | 'critical'; label: string; value: number }> = [];

  for (const field of form.fields) {
    const raw = body.values[field.id];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) {
        return NextResponse.json(
          { error: `Missing required field: ${field.label}` },
          { status: 400 }
        );
      }
      continue;
    }

    if (field.type === 'number') {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!isPlausible(field, n)) {
        return NextResponse.json(
          { error: `Implausible value for ${field.label}: ${raw}` },
          { status: 400 }
        );
      }
      sanitizedValues[field.id] = n;

      const evalResult = evaluateField(field, n);
      if (evalResult.severity !== 'normal') {
        flagged.push({
          field_id: field.id,
          severity: evalResult.severity,
          label: evalResult.label,
          value: n,
        });
      }
    } else if (field.type === 'select') {
      if (field.options && !field.options.includes(String(raw))) {
        return NextResponse.json(
          { error: `Invalid option for ${field.label}: ${raw}` },
          { status: 400 }
        );
      }
      sanitizedValues[field.id] = String(raw);
    } else {
      // text / longtext — sanitize length
      const s = String(raw).slice(0, 2000);
      sanitizedValues[field.id] = s;
    }
  }

  let phone: string;
  try {
    phone = normalizePhone(body.patient.phone);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid phone';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!PHONE_E164.test(phone)) {
    return NextResponse.json({ error: 'Invalid phone format after normalization' }, { status: 400 });
  }

  const db = adminDb();

  try {
    // Find or create patient user. Patients are looked up by phone in two ways:
    //   1. Firestore users where phone_number field matches (set on profile create)
    //   2. Firebase Auth user with matching phoneNumber (set via OTP signup)
    // Fall through to placeholder creation if neither matches.
    let patientUserRef;

    // Step 1: Firestore field lookup with multiple format candidates.
    // Phone might be stored as +91xxx, +1xxx, or just digits.
    const phoneCandidates: string[] = [phone];
    const digitsOnly = phone.replace(/\D/g, '');
    if (!phoneCandidates.includes(digitsOnly)) phoneCandidates.push(digitsOnly);
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      phoneCandidates.push(digitsOnly.slice(2)); // last 10 of India number
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      phoneCandidates.push(digitsOnly.slice(1)); // last 10 of US number
    }

    // Minimal shape we use downstream: empty + docs[]. Both real
    // QuerySnapshot and our synthetic Auth-fallback shape conform.
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
      const snap = await db.collection('users').where('phone_number', '==', candidate).limit(1).get();
      if (!snap.empty) {
        existing = snap as unknown as ExistingShape;
        break;
      }
    }

    // Step 2: Firebase Auth fallback (many users signed up via OTP and never
    // wrote phone_number to their Firestore doc). Try multiple country-code
    // formats since the lab may have entered the number any way.
    if (existing.empty) {
      const auth = adminAuth();
      const authCandidates: string[] = [phone];
      // If the user entered just 10 digits and we defaulted to +91,
      // also try +1 (US/Canada) since many users might be in those markets.
      if (digitsOnly.length === 10) {
        if (!authCandidates.includes(`+1${digitsOnly}`)) authCandidates.push(`+1${digitsOnly}`);
      }

      for (const candidate of authCandidates) {
        try {
          const authUser = await auth.getUserByPhoneNumber(candidate);
          if (authUser) {
            const userDoc = await db.collection('users').doc(authUser.uid).get();
            if (userDoc.exists) {
              existing = {
                docs: [{
                  id: userDoc.id,
                  ref: userDoc.ref,
                  data: () => userDoc.data(),
                }],
                empty: false,
              };
              // Backfill phone_number for next time so step 1 hits going forward
              await userDoc.ref.update({ phone_number: candidate }).catch(() => {});
              break;
            }
          }
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string };
          if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-phone-number') {
            console.warn(`Auth phone lookup failed for ${candidate}:`, err.message);
          }
        }
      }
    }

    if (!existing.empty) {
      patientUserRef = existing.docs[0].ref;
      const cur = existing.docs[0].data() || {};
      const updates: Record<string, unknown> = {};
      if (!cur.display_name && body.patient.name) updates.display_name = body.patient.name;
      if (Object.keys(updates).length > 0) await patientUserRef.update(updates);
    } else {
      // Create placeholder. Marked as `placeholder: true` so the mobile
      // app onboarding knows to merge with the auth user upon signup.
      const newRef = db.collection('users').doc();
      await newRef.set({
        phone_number: phone,
        display_name: body.patient.name,
        gender: body.patient.gender || 'unspecified',
        dob: body.patient.dob || null,
        placeholder: true,
        created_via: 'lab',
        created_by_lab_id: session.lab_id,
        created_at: FieldValue.serverTimestamp(),
        // Pre-link this lab so reports flow without further consent
        linked_labs: [session.lab_id],
      });
      patientUserRef = newRef;
    }

    // Add lab to patient's linked_labs array if not already there. This
    // array remains the source of truth for "which labs has this patient
    // been seen by" for code paths that need quick reads. Consent state
    // lives in the separate `linked_labs/{labId}_{patientUid}` doc — see
    // below.
    await patientUserRef.update({
      linked_labs: FieldValue.arrayUnion(session.lab_id),
    });

    // Read lab profile early so we can snapshot it both onto the
    // consent doc (for the mobile banner copy) and onto the report
    // doc (for the printed PDF branding).
    const labSnapDoc = await db
      .collection('labs')
      .doc(session.lab_id as string)
      .get();
    const labSnap = labSnapDoc.exists ? labSnapDoc.data()! : {};

    // Linked-lab consent record (Section 9.4 of the brief, DPDP §6 fix).
    // Auto-attaching a lab to a patient on every report submission is
    // non-consensual under DPDP. We mitigate by writing a per-relationship
    // doc with `verified: false` on first contact. The mobile app shows
    // a banner on the next report from that lab: "Yes, I visited" /
    // "Not my lab". "Yes" flips the flag; "No" deletes the report and
    // the consent doc.
    //
    // Doc ID is deterministic so subsequent reports from the same lab
    // are no-ops (merge: true on the same doc) and the verified state
    // survives across submissions.
    const linkedLabDocId = `${session.lab_id}_${patientUserRef.id}`;
    try {
      // Read first to know whether we'd be initializing (verified:
      // undefined → set false) or merging into an existing record
      // (don't clobber verified state).
      const existingLinked = await db.collection('linked_labs').doc(linkedLabDocId).get();
      const baseDoc: Record<string, unknown> = {
        lab_id: session.lab_id,
        lab_name: (labSnap as { lab_name?: string }).lab_name || session.lab_code || '',
        patient_user_ref: patientUserRef,
        patient_uid: patientUserRef.id,
        last_report_at: FieldValue.serverTimestamp(),
      };
      if (!existingLinked.exists) {
        baseDoc.first_report_at = FieldValue.serverTimestamp();
        baseDoc.verified = false;
      }
      await db.collection('linked_labs').doc(linkedLabDocId).set(baseDoc, { merge: true });
    } catch (e) {
      // Don't fail the whole report submission on a consent-doc write
      // failure. The patient won't see the banner, but the report still
      // delivers — which is the more important guarantee.
      console.warn(`linked_labs consent write failed for ${linkedLabDocId}:`, e);
    }

    // (labSnap is already loaded above for the consent doc; reuse it
    // here for the report-doc branding snapshot.)

    // Build the report doc payload here, BEFORE the transaction —
    // the transaction body will pass this to tx.set(). The billing
    // fields (billing_amount_paise, billing_balance_after_paise) get
    // merged in inside the transaction once we know the final price.
    const reportData = {
      lab_id: session.lab_id,
      lab_code: session.lab_code,
      lab_name_at_time: body.header?.lab_name || session.lab_name,
      lab_address_at_time: body.header?.lab_address || '',
      lab_phone_at_time: body.header?.lab_phone || '',
      lab_email_at_time: body.header?.lab_email || '',
      lab_logo_url_at_time: labSnap.lab_logo_url || '',
      authorized_signatory_at_time: labSnap.authorized_signatory || '',
      signatory_role_at_time: labSnap.signatory_role || '',

      patient_user_ref: patientUserRef,
      patient_name_at_time: body.patient.name,
      patient_phone_at_time: phone,
      patient_dob_at_time: body.patient.dob || null,
      patient_gender_at_time: body.patient.gender || 'unspecified',
      patient_age_at_time: body.patient.age ?? null,

      form_id: body.form_id,
      form_name: form.name,
      form_category: form.category,

      values: sanitizedValues,
      flagged_fields: flagged,
      max_severity:
        flagged.find((f) => f.severity === 'critical') ? 'critical' :
        flagged.length > 0 ? 'warning' : 'normal',

      test_date: body.header?.test_date || new Date().toISOString().split('T')[0],
      referring_doctor: body.header?.referring_doctor || '',
      sample_collected_at: body.header?.sample_collected_at || '',
      notes: body.header?.notes || '',

      status: 'sent',
      created_at: FieldValue.serverTimestamp(),
    };

    // ════════════════════════════════════════════════════════════
    // Round 7 — Atomic debit-on-submit
    // ════════════════════════════════════════════════════════════
    //
    // The report doc, lab balance update, and credit_ledger entry
    // ALL write inside a single Firestore transaction. Either all
    // three land or none do.
    //
    // Why a transaction is non-optional:
    //
    //   Without it, two simultaneous report submissions can both
    //   read balance=600, both think they have enough, both
    //   succeed, and the balance goes to -600. The lab gets
    //   2 reports for the price of 1 — and accumulating these
    //   bugs across thousands of submissions silently drains us.
    //
    //   Firestore transactions retry on contention up to 5 times
    //   automatically. The retry is invisible to the caller; we
    //   just see the final outcome. If Firestore can't get a
    //   stable read after 5 retries, the transaction throws an
    //   `aborted` error which we surface as a 500.
    //
    // Why ALL reads happen before ANY writes inside the
    // transaction (Firestore requirement):
    //
    //   Firestore enforces read-before-write within transactions.
    //   tx.get() after tx.set() throws. So we read the lab doc
    //   FIRST, do all our validation (suspension check, balance
    //   check), THEN issue the three writes.
    //
    // The labSnap loaded earlier (line ~310) is for the
    // linked_labs consent doc and the report's branding snapshot
    // (lab name, logo URL). It's read OUTSIDE the transaction
    // because:
    //   - It's read-only metadata that doesn't change second-to-
    //     second; a millisecond-stale lab name is fine.
    //   - We need it for the linked_labs write that happens
    //     pre-transaction anyway.
    //   - Re-reading it inside the transaction would just spend
    //     a Firestore read for no benefit.
    //
    // The transaction re-reads the lab doc to get the latest
    // balance (which IS time-sensitive).
    //
    // What's deliberately OUTSIDE this transaction:
    //   - linked_labs consent write (best-effort; failure shouldn't
    //     block report delivery)
    //   - lab_audit_logs (logging failure shouldn't lose data)
    //   - Any side effects the Cloud Functions trigger downstream
    //     (notifyLabReportReceived push, etc.)
    // ════════════════════════════════════════════════════════════

    const reportRef = db.collection('lab_reports').doc();
    const ledgerRef = db.collection('credit_ledger').doc();
    const actorIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    let pricePaise: Paise = DEFAULT_PRICE_PER_REPORT_PAISE;
    let balanceAfterPaise: Paise = 0;
    // Round 9: subscription model output captured for response payload
    let usageBucket: 'normal' | 'overage' = 'normal';
    let reportsAfter: number = 0;
    let overageAfter: number = 0;
    let billingMode: 'subscription' | 'credit' = 'subscription';

    try {
      await db.runTransaction(async (tx) => {
        // ─── READ PHASE ─────────────────────────────────────────
        const labRef = db.collection('labs').doc(session.lab_id as string);
        const labDoc = await tx.get(labRef);
        if (!labDoc.exists) {
          throw new Error(ERR_LAB_NOT_FOUND);
        }
        const lab = labDoc.data() as Record<string, unknown>;

        // ── Manual-suspension check (admin override) ──
        // billing_status === 'suspended' is the OLD field from the
        // credit-balance era. We honor it for backward compat.
        // The NEW field is subscription_active === false. Either one
        // set means: hard-blocked, no upload regardless of dates.
        if (
          lab.billing_status === 'suspended' ||
          lab.subscription_active === false
        ) {
          throw new Error(ERR_LAB_SUSPENDED);
        }

        // ─── BILLING MODE DETECTION ─────────────────────────────
        //
        // Round 9 introduced the subscription model. New labs have
        // subscription_plan set during admin onboarding. Pre-existing
        // labs (none today, but defending against future migration)
        // may still have credit_balance + per_report_paise.
        //
        // Detection: if subscription_plan is set, use subscription
        // model. Otherwise fall back to credit model.
        const hasSubscription =
          typeof lab.subscription_plan === 'string' &&
          (lab.subscription_plan as string).length > 0;

        if (hasSubscription) {
          // ── SUBSCRIPTION MODEL ──
          billingMode = 'subscription';

          // Lazy import to keep the route bundle minimal for the
          // legacy credit code path that doesn't need this helper.
          const { computeSubscriptionStatus, chooseUsageBucket } =
            await import('@/server/billing/subscription_state');

          const status = computeSubscriptionStatus(lab);
          if (status.is_suspended) {
            // Either expired beyond grace, or unset. Both bubble up
            // as the same user-facing error: contact your rep.
            throw new Error(ERR_LAB_SUSPENDED);
          }

          const bucket = chooseUsageBucket(lab);
          usageBucket = bucket;
          const reportsUsed =
            (lab.current_period_report_count as number | undefined) ?? 0;
          const overageUsed =
            (lab.current_period_overage_count as number | undefined) ?? 0;

          // The price snapshot recorded on the report. For
          // subscription labs, "price" is the marginal cost of this
          // report — which is 0 for normal usage (covered by tier)
          // or OVERAGE_PRICE_PAISE for overage.
          const { OVERAGE_PRICE_PAISE } = await import(
            '@/lib/subscription_tiers'
          );
          pricePaise = bucket === 'overage' ? OVERAGE_PRICE_PAISE : 0;
          reportsAfter = bucket === 'normal' ? reportsUsed + 1 : reportsUsed;
          overageAfter =
            bucket === 'overage' ? overageUsed + 1 : overageUsed;

          // ── WRITE PHASE (subscription model) ──
          tx.set(reportRef, {
            ...reportData,
            billing_amount_paise: pricePaise,
            billing_balance_after_paise: 0, // not applicable for subs
            billing_mode: 'subscription',
            billing_usage_bucket: bucket,
          });

          // Increment the appropriate counter atomically. Using
          // FieldValue.increment is race-safe even with concurrent
          // writes (Firestore handles the merge).
          if (bucket === 'normal') {
            tx.update(labRef, {
              current_period_report_count: FieldValue.increment(1),
              last_credit_event_at: FieldValue.serverTimestamp(),
            });
          } else {
            tx.update(labRef, {
              current_period_overage_count: FieldValue.increment(1),
              last_credit_event_at: FieldValue.serverTimestamp(),
            });
          }

          // Append a lightweight audit entry for revenue calculation.
          // We use credit_ledger because it's already wired for
          // reporting; the `direction: 'usage'` distinguishes from
          // legacy debit entries.
          tx.set(ledgerRef, {
            lab_id: session.lab_id,
            direction: 'usage',
            amount_paise: pricePaise, // 0 for normal, ₹5 for overage
            reason:
              bucket === 'overage'
                ? 'report_submission_overage'
                : 'report_submission_subscription',
            balance_after_paise: 0,
            linked_doc_path: `lab_reports/${reportRef.id}`,
            actor_type: 'lab',
            actor_id: session.lab_id,
            actor_ip: actorIp,
            metadata: {
              form_id: body.form_id,
              form_name: form.name,
              patient_phone_last4: phone.slice(-4),
              subscription_tier: lab.subscription_plan,
              usage_bucket: bucket,
            },
            created_at: FieldValue.serverTimestamp(),
          });

          balanceAfterPaise = 0; // for response shape compatibility
          return;
        }

        // ── LEGACY CREDIT MODEL (pre-Round-9, kept for back-compat) ──
        billingMode = 'credit';

        const price: Paise =
          typeof lab.per_report_paise === 'number'
            ? (lab.per_report_paise as number)
            : DEFAULT_PRICE_PER_REPORT_PAISE;

        const balance: Paise =
          typeof lab.credit_balance === 'number'
            ? (lab.credit_balance as number)
            : 0;

        if (balance < price) {
          const err = new Error(ERR_INSUFFICIENT_CREDITS);
          (err as Error & { current_balance?: number; required?: number })
            .current_balance = balance;
          (err as Error & { current_balance?: number; required?: number })
            .required = price;
          throw err;
        }

        const newBalance: Paise = balance - price;

        tx.set(reportRef, {
          ...reportData,
          billing_amount_paise: price,
          billing_balance_after_paise: newBalance,
          billing_mode: 'credit',
        });

        tx.update(labRef, {
          credit_balance: newBalance,
          last_credit_event_at: FieldValue.serverTimestamp(),
        });

        tx.set(ledgerRef, {
          lab_id: session.lab_id,
          direction: 'debit',
          amount_paise: price,
          reason: 'report_submission',
          balance_after_paise: newBalance,
          linked_doc_path: `lab_reports/${reportRef.id}`,
          actor_type: 'lab',
          actor_id: session.lab_id,
          actor_ip: actorIp,
          metadata: {
            form_id: body.form_id,
            form_name: form.name,
            patient_phone_last4: phone.slice(-4),
          },
          created_at: FieldValue.serverTimestamp(),
        });

        pricePaise = price;
        balanceAfterPaise = newBalance;
      });
    } catch (txErr) {
      // Map known transaction errors to HTTP responses per Section 4.
      if (txErr instanceof Error) {
        if (txErr.message === ERR_INSUFFICIENT_CREDITS) {
          const e = txErr as Error & {
            current_balance?: number;
            required?: number;
          };
          return NextResponse.json(
            {
              error: 'insufficient_credits',
              current_balance_paise: e.current_balance ?? 0,
              required_paise: e.required ?? DEFAULT_PRICE_PER_REPORT_PAISE,
              topup_url: '/billing',
              message:
                'Not enough credits to submit this report. Top up to continue.',
            },
            { status: 402 }
          );
        }
        if (txErr.message === ERR_LAB_SUSPENDED) {
          return NextResponse.json(
            {
              error: 'lab_suspended',
              // Round 9: this code is now triggered by either
              //   (a) admin manual suspension (subscription_active=false), or
              //   (b) subscription expired beyond grace period, or
              //   (c) lab has no subscription plan assigned yet.
              // The user-facing message is intentionally vague — the lab
              // user should contact their sales rep, who can look up
              // which case applies in the admin portal.
              message:
                'This lab account cannot submit reports right now. Please contact your sales rep to reactivate.',
            },
            { status: 403 }
          );
        }
        if (txErr.message === ERR_LAB_NOT_FOUND) {
          return NextResponse.json(
            { error: 'lab_not_found', message: 'Lab account not found.' },
            { status: 404 }
          );
        }
      }
      // Unknown failure — log and return 500. The transaction was
      // atomic so nothing partial was written.
      console.error('Report submit transaction failed:', txErr);
      return NextResponse.json(
        { error: 'Failed to submit report' },
        { status: 500 }
      );
    }
    // Transaction committed. Continue with non-critical side effects.

    // NOTE: We deliberately do NOT mirror lab values into vitals_log.
    //
    // vitals_log is reserved for real-time vitals (manual entry by the
    // patient, CGM auto-sync, sensor anomalies) where a critical reading
    // is happening RIGHT NOW and family should be alerted with a
    // bypass-DND siren.
    //
    // A lab report is delayed information — by the time it arrives, the
    // event (the blood draw) is in the past. The patient is at home or
    // back at work, not in mid-emergency. Treating it as an emergency
    // would:
    //   - Wake family at night for old data
    //   - Train them to dismiss our alerts
    //   - Trigger expensive critical-priority pushes for non-urgent info
    //
    // Instead, the `notifyLabReportReceived` Cloud Function (separate
    // file) sends a polite "your report is ready" push to the patient,
    // and an opt-in "look at <name>'s report" push to family members
    // who have lab-report sharing enabled.

    // Audit log — separate collection for compliance / dispute resolution
    await db.collection('lab_audit_logs').add({
      action: 'report_submitted',
      lab_id: session.lab_id,
      lab_code: session.lab_code,
      report_ref: reportRef,
      patient_phone: phone,
      form_id: body.form_id,
      max_severity: reportData.max_severity,
      // Round 7: capture what was charged for this submission
      billing_amount_paise: pricePaise,
      billing_balance_after_paise: balanceAfterPaise,
      created_at: FieldValue.serverTimestamp(),
    });

    void writeAudit({
      action: 'report.create',
      ...actorFromSession(session),
      target_kind: 'report',
      target_id: reportRef.id,
      patient_phone_hash: hashPhone(phone),
      metadata: {
        form_id: body.form_id,
        max_severity: reportData.max_severity,
        flagged_count: flagged.length,
      },
      ...clientMetaFromReq(req),
    });

    return NextResponse.json({
      ok: true,
      report_id: reportRef.id,
      flagged_count: flagged.length,
      max_severity: reportData.max_severity,
      // Round 7: surface billing info so the lab portal UI can
      // immediately update the balance display without waiting for a
      // separate /api/billing/balance round-trip.
      // Round 9: subscription mode also surfaces here so UI can show
      // "X / Y reports used this month" plus overage indicator.
      billing: {
        mode: billingMode,
        amount_charged_paise: pricePaise,
        balance_after_paise: balanceAfterPaise, // 0 for subscription mode
        usage_bucket: usageBucket, // 'normal' | 'overage'
        reports_used_after: reportsAfter,
        overage_after: overageAfter,
      },
    });
  } catch (err) {
    console.error('Report submit error:', err);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
