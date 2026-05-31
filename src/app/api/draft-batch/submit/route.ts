import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import { getSession } from '@/server/auth/session';
import {
  STANDARD_FORMS,
  evaluateField,
  type FormField,
} from '@/lib/forms';
import { resolveOrCreatePatient } from '@/server/patients/resolver';
import {
  computeSubscriptionStatus,
  type LabSubscriptionFields,
} from '@/server/billing/subscription_state';
import { OVERAGE_PRICE_PAISE } from '@/lib/subscription_tiers';
import { writeAudit, hashPhone, actorFromSession, clientMetaFromReq } from '@/server/audit/log';
import { normalizePhoneForDraft } from '@/lib/draft_batch';

export const runtime = 'nodejs';

/**
 * POST /api/draft-batch/submit
 *
 * Materializes the lab's current draft into N `lab_reports/{id}` docs
 * (one per test in the cart), each linked by a shared `batch_id`.
 *
 * On success:
 *   - N lab_reports docs created, all with batch_id = (new batch UUID)
 *   - Lab's subscription counters incremented atomically
 *   - N credit_ledger entries written
 *   - The draft document deleted
 *
 * On failure:
 *   - Atomicity: the Firestore transaction either commits all writes
 *     or none. The draft is preserved so the tech can retry.
 *
 * Round 9 Session D.
 *
 * --- DESIGN NOTES ---
 *
 * Why one transaction for the whole batch, not per-test:
 *   The existing /api/reports route runs a transaction per submission.
 *   For batches we MUST do them all together — otherwise, a 5-test
 *   batch could partially fail (3 succeed, 2 fail), leaving the
 *   patient with an incomplete report and the lab having paid for 3
 *   uses of their cap that they didn't get to deliver.
 *
 * Why not call /api/reports N times in a loop:
 *   Same problem as above plus N round-trips of HTTP calls. Each HTTP
 *   call also re-runs patient resolution which would create N
 *   duplicate placeholder records if the patient is new.
 *
 * Subscription accounting under N tests:
 *   Read lab doc inside transaction. Compute how many of N fit under
 *   the cap (normal bucket) vs go to overage. Increment both counters
 *   in a single update.
 *
 * batch_id:
 *   Generated server-side as a Firestore doc ref ID prefix. Stored on
 *   each report's `batch_id` field. Client uses this to query "show
 *   me all tests in this batch" (e.g., for the patient's combined PDF
 *   view, or for a future "view as group" UI).
 *
 * Cloud Function downstream:
 *   When a batch lands, a Cloud Function (`generateCombinedBatchPdf`,
 *   in firebase/custom_cloud_functions/) detects the batch via the
 *   batch_id field on the first-created report and renders one
 *   combined PDF covering all sibling reports. The Cloud Function
 *   code is included in this round but must be deployed separately
 *   (it lives in the mobile app repo's firebase/ directory, not the
 *   lab portal repo).
 */

interface SubmitResult {
  ok: true;
  batch_id: string;
  reports_created: number;
  reports_normal: number;
  reports_overage: number;
  patient_user_ref_path: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'lab') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = adminDb();
  const labId = session.lab_id;
  const draftRef = db
    .collection('labs')
    .doc(labId)
    .collection('draft_batches')
    .doc('current');

  // ── Step 1: Read draft ──
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) {
    return NextResponse.json(
      { error: 'No draft to submit' },
      { status: 404 },
    );
  }
  const draft = draftSnap.data() as {
    patient: {
      name: string;
      phone: string;
      age: number | null;
      sex: 'M' | 'F' | 'O' | null;
      referring_doctor: string | null;
      collection_date: string | null;
      sample_id: string | null;
    };
    tests: Array<{
      form_id: string;
      form_name: string;
      category: string;
      status: string;
      values: Record<string, number | string>;
      price_paise?: number;
    }>;
  };

  // ── Step 2: Validate ──
  if (!draft.patient || !draft.patient.name || !draft.patient.phone) {
    return NextResponse.json(
      { error: 'Draft has incomplete patient details' },
      { status: 400 },
    );
  }
  if (!draft.tests || draft.tests.length === 0) {
    return NextResponse.json(
      { error: 'Draft has no tests' },
      { status: 400 },
    );
  }
  // Every test must be completed or partial
  const incomplete = draft.tests.filter(
    (t) => t.status !== 'completed' && t.status !== 'partial',
  );
  if (incomplete.length > 0) {
    return NextResponse.json(
      {
        error: 'All tests must be marked complete or partial before submitting',
        incomplete_test_form_ids: incomplete.map((t) => t.form_id),
      },
      { status: 400 },
    );
  }
  // Validate every form_id is real AND not a panel/bundle. Panels are
  // virtual aggregators — when a tech adds a panel in Step 2, the cart
  // logic expands it into component tests and the panel id never makes
  // it to the draft. Defense-in-depth: reject panel ids explicitly in
  // case a draft was created with old code.
  const validFormIds = new Set(STANDARD_FORMS.map((f) => f.id));
  for (const t of draft.tests) {
    if (!validFormIds.has(t.form_id)) {
      return NextResponse.json(
        { error: `Unknown form_id: ${t.form_id}` },
        { status: 400 },
      );
    }
    const formDef = STANDARD_FORMS.find((f) => f.id === t.form_id);
    if (formDef?.category === 'panel' || formDef?.bundle_form_ids) {
      return NextResponse.json(
        {
          error: `${t.form_id} is a panel/bundle; cart should contain its components, not the panel itself. Discard the draft and try again.`,
        },
        { status: 400 },
      );
    }
  }

  // ── Step 3: Resolve patient (OUTSIDE transaction; idempotent) ──
  const phone = normalizePhone(draft.patient.phone);
  if (!phone) {
    return NextResponse.json(
      { error: 'Invalid patient phone number' },
      { status: 400 },
    );
  }
  let patientUserRef: FirebaseFirestore.DocumentReference;
  try {
    const resolved = await resolveOrCreatePatient(
      {
        phone,
        name: draft.patient.name,
        gender:
          draft.patient.sex === 'M'
            ? 'male'
            : draft.patient.sex === 'F'
            ? 'female'
            : 'unspecified',
        age: draft.patient.age,
      },
      labId,
    );
    patientUserRef = resolved.ref;
  } catch (e) {
    console.error('[submit] patient resolution failed:', e);
    return NextResponse.json(
      { error: 'Failed to resolve patient. Try again.' },
      { status: 500 },
    );
  }

  // ── Step 4: Pre-build report docs (one per test) ──
  // We do as much work as possible OUTSIDE the transaction so the
  // transaction runs fast (Firestore retries on contention; less
  // work = fewer retries).

  const batchId = db.collection('lab_reports').doc().id;
  const testDate =
    draft.patient.collection_date ?? new Date().toISOString().split('T')[0];

  // Read lab metadata once for branding snapshot
  const labSnap = await db.collection('labs').doc(labId).get();
  if (!labSnap.exists) {
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
  }
  const lab = labSnap.data() ?? {};

  // Pre-compute report payloads
  const reportPayloads = draft.tests.map((t, idx) => {
    const form = STANDARD_FORMS.find((f) => f.id === t.form_id)!;
    const sanitized = sanitizeValuesForForm(form.fields, t.values);
    const flagged = computeFlagged(form.fields, sanitized);
    const maxSeverity = flagged.find((f) => f.severity === 'critical')
      ? 'critical'
      : flagged.length > 0
      ? 'warning'
      : 'normal';

    return {
      ref: db.collection('lab_reports').doc(),
      data: {
        // Identity
        lab_id: labId,
        lab_code: session.lab_code,
        lab_name_at_time: (lab.lab_name as string | undefined) ?? session.lab_name,
        lab_address_at_time: (lab.lab_address as string | undefined) ?? '',
        lab_phone_at_time: (lab.lab_phone as string | undefined) ?? '',
        lab_email_at_time: (lab.lab_email as string | undefined) ?? '',
        lab_logo_url_at_time: (lab.lab_logo_url as string | undefined) ?? '',
        authorized_signatory_at_time:
          (lab.authorized_signatory as string | undefined) ?? '',
        signatory_role_at_time: (lab.signatory_role as string | undefined) ?? '',

        // Patient
        patient_user_ref: patientUserRef,
        patient_name_at_time: draft.patient.name,
        patient_phone_at_time: phone,
        patient_dob_at_time: null,
        patient_gender_at_time:
          draft.patient.sex === 'M'
            ? 'male'
            : draft.patient.sex === 'F'
            ? 'female'
            : 'unspecified',
        patient_age_at_time: draft.patient.age ?? null,

        // Test
        form_id: t.form_id,
        form_name: form.name,
        form_category: form.category,
        values: sanitized,
        flagged_fields: flagged,
        max_severity: maxSeverity,

        // Batch metadata (Round 9 Session D)
        batch_id: batchId,
        batch_test_count: draft.tests.length,
        batch_position: idx + 1,
        batch_status: t.status, // 'completed' or 'partial'

        // Workflow
        test_date: testDate,
        referring_doctor: draft.patient.referring_doctor ?? '',
        sample_collected_at: '',
        notes: t.status === 'partial' ? 'Partial: not all required fields entered.' : '',

        status: 'sent',
        created_at: FieldValue.serverTimestamp(),
      },
      pricePaise: t.price_paise ?? 0,
    };
  });

  // ── Step 5: Atomic transaction ──
  // The whole batch commits or none of it.
  let result: SubmitResult;
  try {
    result = await db.runTransaction(async (tx) => {
      // ── READ ──
      const labRef = db.collection('labs').doc(labId);
      const labDoc = await tx.get(labRef);
      if (!labDoc.exists) throw new Error('LAB_NOT_FOUND');
      const labData = labDoc.data() as Record<string, unknown>;

      // Suspension checks (subscription model OR legacy)
      if (
        labData.billing_status === 'suspended' ||
        labData.subscription_active === false
      ) {
        throw new Error('LAB_SUSPENDED');
      }

      // Subscription state check
      const status = computeSubscriptionStatus(
        labData as LabSubscriptionFields,
      );
      if (status.is_suspended) {
        // Either expired beyond grace, or never assigned a plan.
        throw new Error('LAB_SUSPENDED');
      }

      // ── BUCKET ASSIGNMENT ──
      // For N tests in the batch, decide how many fit in normal cap
      // vs how many go to overage.
      const N = reportPayloads.length;
      const reportsUsed = (labData.current_period_report_count as number) ?? 0;
      const cap = status.monthly_cap; // null for PAYG

      let normalCount: number;
      let overageCount: number;
      if (cap === null) {
        // PAYG — everything counts as normal
        normalCount = N;
        overageCount = 0;
      } else {
        const remaining = Math.max(0, cap - reportsUsed);
        normalCount = Math.min(N, remaining);
        overageCount = N - normalCount;
      }

      // ── WRITE: report docs ──
      reportPayloads.forEach((p, idx) => {
        const isOverage = idx >= normalCount;
        const billingPaise = isOverage ? OVERAGE_PRICE_PAISE : 0;
        tx.set(p.ref, {
          ...p.data,
          billing_amount_paise: billingPaise,
          billing_balance_after_paise: 0,
          billing_mode: 'subscription',
          billing_usage_bucket: isOverage ? 'overage' : 'normal',
          // Snapshot the patient-facing price the lab charged for THIS test
          patient_price_paise: p.pricePaise,
        });
      });

      // ── WRITE: increment lab counters ──
      tx.update(labRef, {
        current_period_report_count: FieldValue.increment(normalCount),
        current_period_overage_count: FieldValue.increment(overageCount),
        last_credit_event_at: FieldValue.serverTimestamp(),
      });

      // ── WRITE: ledger entries ──
      reportPayloads.forEach((p, idx) => {
        const isOverage = idx >= normalCount;
        const billingPaise = isOverage ? OVERAGE_PRICE_PAISE : 0;
        const ledgerRef = db.collection('credit_ledger').doc();
        tx.set(ledgerRef, {
          lab_id: labId,
          direction: 'usage',
          amount_paise: billingPaise,
          reason: isOverage
            ? 'report_submission_overage'
            : 'report_submission_subscription',
          balance_after_paise: 0,
          linked_doc_path: `lab_reports/${p.ref.id}`,
          actor_type: 'lab',
          actor_id: labId,
          actor_ip: 'batch_submit', // not bothering to extract per-call here
          metadata: {
            form_id: p.data.form_id,
            form_name: p.data.form_name,
            patient_phone_last4: phone.slice(-4),
            subscription_tier: labData.subscription_plan,
            usage_bucket: isOverage ? 'overage' : 'normal',
            batch_id: batchId,
            batch_position: idx + 1,
            batch_test_count: N,
          },
          created_at: FieldValue.serverTimestamp(),
        });
      });

      // ── WRITE: batch summary doc ──
      // Round 9 Session 1 (Architecture C): denormalized summary so
      // the patient feed can render ONE batch card per batch without
      // fetching all N child reports.
      //
      // The Cloud Function `generateCombinedBatchPdf` will later
      // update this doc with combined_pdf_storage_path and flip
      // combined_pdf_status to 'ready'. The patient app polls/listens
      // to this doc for the "Combined PDF" button.
      const maxSeverityAcrossBatch = (() => {
        let worst: 'normal' | 'warning' = 'normal';
        for (const p of reportPayloads) {
          const sev = p.data.max_severity as 'normal' | 'warning' | 'critical';
          if (sev === 'critical') return 'critical';
          if (sev === 'warning') worst = 'warning';
        }
        return worst;
      })();
      const flaggedCountAcrossBatch = reportPayloads.reduce(
        (sum, p) =>
          sum + ((p.data.flagged_fields as unknown[] | undefined)?.length ?? 0),
        0,
      );
      const partialCountAcrossBatch = reportPayloads.filter(
        (p) => p.data.batch_status === 'partial',
      ).length;
      // Unique categories preserving first-seen order. Drives the
      // PDF cover page's "which organs to highlight" decision and
      // the patient feed's category-icon strip.
      const seenCategories = new Set<string>();
      const uniqueCategories: string[] = [];
      for (const p of reportPayloads) {
        const cat = p.data.form_category as string;
        if (!seenCategories.has(cat)) {
          seenCategories.add(cat);
          uniqueCategories.push(cat);
        }
      }
      // Compact per-test summaries for the expand-to-detail view.
      // Includes form_id so the mobile app can deep-link to the
      // individual lab_reports/{id} doc.
      const testSummaries = reportPayloads.map((p) => ({
        form_id: p.data.form_id,
        form_name: p.data.form_name,
        category: p.data.form_category,
        max_severity: p.data.max_severity,
        flagged_count:
          (p.data.flagged_fields as unknown[] | undefined)?.length ?? 0,
        batch_status: p.data.batch_status,
        report_id: p.ref.id,
      }));

      const batchSummaryRef = db.collection('lab_report_batches').doc(batchId);
      tx.set(batchSummaryRef, {
        batch_id: batchId,
        // Identity
        patient_user_ref: patientUserRef,
        patient_uid: patientUserRef.id,
        patient_name_at_time: draft.patient.name,
        patient_phone_at_time: phone,
        lab_id: labId,
        lab_code: session.lab_code,
        lab_name_at_time: (lab.lab_name as string | undefined) ?? session.lab_name,
        // Aggregates
        test_count: N,
        test_categories: uniqueCategories,
        test_summaries: testSummaries,
        max_severity_across_batch: maxSeverityAcrossBatch,
        flagged_count: flaggedCountAcrossBatch,
        partial_count: partialCountAcrossBatch,
        // Combined-PDF state — Cloud Function fills these in
        combined_pdf_storage_path: null,
        combined_pdf_status: 'pending', // 'pending' | 'ready' | 'failed'
        combined_pdf_generated_at: null,
        // Notification dedup state — Cloud Function flips this
        notification_sent: false,
        notification_sent_at: null,
        // Workflow
        test_date: testDate,
        created_at: FieldValue.serverTimestamp(),
      });

      // ── WRITE: delete draft ──
      tx.delete(draftRef);

      return {
        ok: true,
        batch_id: batchId,
        reports_created: N,
        reports_normal: normalCount,
        reports_overage: overageCount,
        patient_user_ref_path: patientUserRef.path,
      } as SubmitResult;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg === 'LAB_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Lab account not found' },
        { status: 404 },
      );
    }
    if (msg === 'LAB_SUSPENDED') {
      return NextResponse.json(
        {
          error: 'lab_suspended',
          message:
            'Your account cannot submit reports right now. Contact your sales rep.',
        },
        { status: 403 },
      );
    }
    console.error('[submit] transaction failed:', e);
    return NextResponse.json(
      { error: 'Failed to submit. Your draft is preserved — try again.' },
      { status: 500 },
    );
  }

  void writeAudit({
    action: 'draft.submit',
    ...actorFromSession(session),
    target_kind: 'batch',
    target_id: result.batch_id,
    patient_phone_hash: hashPhone(draft.patient?.phone ?? null),
    metadata: {
      reports_created: result.reports_created,
      reports_overage: result.reports_overage,
    },
    ...clientMetaFromReq(req),
  });

  return NextResponse.json(result);
}

/* ───────────────── helpers ───────────────── */

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already has country code
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  // Just digits → assume India
  const digits = normalizePhoneForDraft(trimmed);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return null;
}

function sanitizeValuesForForm(
  fields: FormField[],
  values: Record<string, number | string>,
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[f.id] = n;
    } else {
      out[f.id] = String(v);
    }
  }
  return out;
}

function computeFlagged(
  fields: FormField[],
  values: Record<string, number | string>,
): Array<{
  field_id: string;
  field_label: string;
  value: number | string;
  severity: 'normal' | 'warning' | 'critical';
  label: string;
}> {
  const flagged: Array<{
    field_id: string;
    field_label: string;
    value: number | string;
    severity: 'normal' | 'warning' | 'critical';
    label: string;
  }> = [];
  for (const f of fields) {
    if (f.type !== 'number') continue;
    const v = values[f.id];
    if (typeof v !== 'number') continue;
    const evaluation = evaluateField(f, v);
    if (evaluation.severity !== 'normal') {
      flagged.push({
        field_id: f.id,
        field_label: f.label,
        value: v,
        severity: evaluation.severity,
        label: evaluation.label,
      });
    }
  }
  return flagged;
}
