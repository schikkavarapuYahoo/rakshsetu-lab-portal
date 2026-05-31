import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebase-admin';
import type { SessionPayload } from '@/server/auth/session';
import type { NextRequest } from 'next/server';

/**
 * Audit log writer for PHI (Protected Health Information) access.
 *
 * India's DPDP Act 2023 (Digital Personal Data Protection) and emerging
 * healthcare regulations require labs to maintain access trails for
 * patient data. HIPAA equivalents in other jurisdictions require the
 * same. This module provides a single write point for those records.
 *
 * Storage: collection `audit_logs/{auto-id}`. Append-only. Never
 * deleted by the app. Long-term retention policy + export should be
 * configured at the Firestore project level (TTL fields, scheduled
 * export to BigQuery, etc.).
 *
 * Writes are best-effort: failures are logged but never block the
 * caller. PHI access must not be gated on audit-write success — that
 * would create a denial-of-service via Firestore quota.
 */

export type AuditAction =
  | 'patient.lookup'
  | 'patient.view'
  | 'report.view'
  | 'report.list'
  | 'report.create'
  | 'report.update'
  | 'report.delete'
  | 'draft.read'
  | 'draft.write'
  | 'draft.delete'
  | 'draft.submit'
  | 'lab_settings.view'
  | 'lab_settings.update';

export interface AuditEvent {
  action: AuditAction;
  actor_lab_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  target_kind: 'patient' | 'report' | 'batch' | 'draft' | 'lab' | null;
  target_id: string | null;
  patient_phone_hash: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  ip: string | null;
  user_agent: string | null;
}

const COLLECTION = 'audit_logs';

export async function writeAudit(event: AuditEvent): Promise<void> {
  try {
    await adminDb().collection(COLLECTION).add({
      ...event,
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[audit] write failed:', e);
  }
}

export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 4) return null;
  return `***${digits.slice(-4)}`;
}

export function actorFromSession(
  session: SessionPayload,
): Pick<AuditEvent, 'actor_lab_id' | 'actor_user_id' | 'actor_role'> {
  if (session.role === 'lab') {
    return {
      actor_lab_id: session.lab_id,
      actor_user_id: session.lab_code,
      actor_role: session.role,
    };
  }
  return {
    actor_lab_id: null,
    actor_user_id: session.staff_id,
    actor_role: session.role,
  };
}

export function clientMetaFromReq(
  req: NextRequest,
): Pick<AuditEvent, 'ip' | 'user_agent'> {
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: req.headers.get('user-agent'),
  };
}
