import 'server-only';

/**
 * Subscription state engine. Given a lab's stored subscription fields,
 * computes the current effective state (active / grace / suspended).
 *
 * Why this is a function and not a stored field:
 *
 *   The state depends on TIME ("has subscription_expires_at passed?").
 *   If we stored the state explicitly, we'd need a cron to flip labs
 *   from `active` to `grace_period` at midnight on their expiration
 *   day, and from `grace_period` to `suspended_readonly` 7 days later.
 *   That's two cron jobs that can fail independently, two failure
 *   modes where a lab could end up in a wrong state, and two more
 *   things to monitor.
 *
 *   Instead: store the dates, compute the state on every access. No
 *   cron, no drift. The only stored boolean we trust is
 *   `subscription_active` (set to false when admin manually suspends
 *   a misbehaving lab). Everything else is derived.
 *
 * Used by:
 *   - `enforceSubscription()` middleware on POST /api/reports
 *   - Lab dashboard banner (active/grace/suspended display)
 *   - Admin UI showing lab subscription panel
 *   - Reporting / revenue dashboard
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  SubscriptionState,
  SubscriptionTier,
  BillingCycle,
  GRACE_PERIOD_DAYS,
  getTier,
} from '@/lib/subscription_tiers';

/**
 * Subscription-related fields read off labs/{id}. Pass in the lab doc's
 * data — we destructure only what we need so the function is testable
 * without mocking Firestore.
 */
export interface LabSubscriptionFields {
  subscription_plan?: SubscriptionTier | null;
  subscription_active?: boolean;
  subscription_billing_cycle?: BillingCycle | null;
  subscription_started_at?: Timestamp | Date | null;
  subscription_expires_at?: Timestamp | Date | null;
  current_period_started_at?: Timestamp | Date | null;
  current_period_report_count?: number;
  current_period_overage_count?: number;
}

export interface SubscriptionStatus {
  state: SubscriptionState;
  /** Tier ID, or null if no plan ever assigned. */
  tier: SubscriptionTier | null;
  billing_cycle: BillingCycle | null;
  /** Days remaining in current billing period. Negative during grace. */
  days_remaining: number | null;
  /** Reports used in current billing period. */
  reports_used: number;
  /** Reports beyond cap. 0 unless overage occurred. */
  reports_overage: number;
  /** Cap for current tier. null if PAYG (unlimited). */
  monthly_cap: number | null;
  /** True when state is `suspended_readonly` — block new uploads. */
  is_suspended: boolean;
  /** True when state is grace_period — show banner but allow uploads. */
  is_in_grace: boolean;
  /** True when reports_used > monthly_cap. Only meaningful for capped tiers. */
  is_in_overage: boolean;
  /** Human-readable description for admin UI. */
  description: string;
}

/**
 * Convert a Firestore Timestamp or JS Date to a JS Date. Tolerant of
 * either — Firestore admin SDK returns Timestamp, but the lab might
 * have a Date if the doc was just constructed in-memory.
 */
function toDate(t: Timestamp | Date | null | undefined): Date | null {
  if (!t) return null;
  if (t instanceof Date) return t;
  // firebase-admin Timestamp has a .toDate() method
  if (typeof (t as Timestamp).toDate === 'function') {
    return (t as Timestamp).toDate();
  }
  return null;
}

/**
 * Compute current subscription status for a lab.
 *
 * Decision tree:
 *
 *   1. No plan assigned → state = 'unset', is_suspended = true
 *      (Lab can log in but can't submit reports until admin assigns a plan)
 *
 *   2. subscription_active === false → state = 'suspended_readonly'
 *      (Admin manually suspended the lab — overrides date checks)
 *
 *   3. Has plan, expires_at in future → state = 'active' or 'active_overage'
 *      (Determined by reports_used vs cap)
 *
 *   4. Has plan, expires_at in past, but within grace window
 *      → state = 'grace_period'
 *      (Lab can still upload, banner urges payment)
 *
 *   5. Has plan, expires_at in past, beyond grace window
 *      → state = 'suspended_readonly'
 *      (Lab logs in to read-only view, must contact rep)
 */
export function computeSubscriptionStatus(
  lab: LabSubscriptionFields,
  now: Date = new Date(),
): SubscriptionStatus {
  const tier = lab.subscription_plan ?? null;
  const cycle = lab.subscription_billing_cycle ?? null;
  const expiresAt = toDate(lab.subscription_expires_at);
  const reportsUsed = lab.current_period_report_count ?? 0;
  const reportsOverage = lab.current_period_overage_count ?? 0;
  const monthlyCap = tier ? getTier(tier).monthly_report_cap : null;

  // Case 1: never been assigned a plan (newly-created lab)
  if (!tier) {
    return {
      state: 'unset',
      tier: null,
      billing_cycle: null,
      days_remaining: null,
      reports_used: reportsUsed,
      reports_overage: reportsOverage,
      monthly_cap: null,
      is_suspended: true,
      is_in_grace: false,
      is_in_overage: false,
      description: 'No subscription assigned. Contact admin.',
    };
  }

  // Case 2: admin manually suspended (overrides everything)
  if (lab.subscription_active === false) {
    return {
      state: 'suspended_readonly',
      tier,
      billing_cycle: cycle,
      days_remaining: null,
      reports_used: reportsUsed,
      reports_overage: reportsOverage,
      monthly_cap: monthlyCap,
      is_suspended: true,
      is_in_grace: false,
      is_in_overage: false,
      description: 'Suspended by administrator. Contact your sales rep.',
    };
  }

  // Without an expiration date, we can't determine state. Treat as suspended.
  // (This shouldn't happen for an active subscription — the admin "record
  //  payment" flow always sets expires_at — but defending against it is cheap.)
  if (!expiresAt) {
    return {
      state: 'suspended_readonly',
      tier,
      billing_cycle: cycle,
      days_remaining: null,
      reports_used: reportsUsed,
      reports_overage: reportsOverage,
      monthly_cap: monthlyCap,
      is_suspended: true,
      is_in_grace: false,
      is_in_overage: false,
      description: 'Subscription incomplete — no expiration set. Contact admin.',
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilExpiry = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / msPerDay,
  );

  // Case 3: actively paid, within billing period
  if (daysUntilExpiry > 0) {
    const isInOverage = monthlyCap !== null && reportsUsed > monthlyCap;
    return {
      state: isInOverage ? 'active_overage' : 'active',
      tier,
      billing_cycle: cycle,
      days_remaining: daysUntilExpiry,
      reports_used: reportsUsed,
      reports_overage: reportsOverage,
      monthly_cap: monthlyCap,
      is_suspended: false,
      is_in_grace: false,
      is_in_overage: isInOverage,
      description: isInOverage
        ? `Active (overage: ${reportsOverage} reports beyond ${monthlyCap}-cap)`
        : `Active. ${daysUntilExpiry} days remaining.`,
    };
  }

  // Past expiration. Compute how many days into grace (or beyond).
  const daysSinceExpiry = -daysUntilExpiry;

  // Case 4: in grace period (≤7 days past expiry)
  if (daysSinceExpiry <= GRACE_PERIOD_DAYS) {
    const graceDaysRemaining = GRACE_PERIOD_DAYS - daysSinceExpiry;
    return {
      state: 'grace_period',
      tier,
      billing_cycle: cycle,
      days_remaining: -daysSinceExpiry, // negative — past expiry
      reports_used: reportsUsed,
      reports_overage: reportsOverage,
      monthly_cap: monthlyCap,
      is_suspended: false,
      is_in_grace: true,
      is_in_overage: false,
      description: `Subscription expired ${daysSinceExpiry} day(s) ago. ${graceDaysRemaining} grace day(s) remaining. Please pay to renew.`,
    };
  }

  // Case 5: beyond grace period — suspend
  return {
    state: 'suspended_readonly',
    tier,
    billing_cycle: cycle,
    days_remaining: -daysSinceExpiry,
    reports_used: reportsUsed,
    reports_overage: reportsOverage,
    monthly_cap: monthlyCap,
    is_suspended: true,
    is_in_grace: false,
    is_in_overage: false,
    description: `Subscription expired ${daysSinceExpiry} days ago. Account suspended (read-only). Contact your sales rep to reactivate.`,
  };
}

/**
 * Convenience: just the boolean — can this lab create reports right now?
 *
 * Used by the report-creation API route as a quick pre-check before
 * doing any expensive work. The transaction inside POST /api/reports
 * does its own check using the same logic but reading the lab doc
 * inside the transaction (race-safe).
 */
export function canLabCreateReports(lab: LabSubscriptionFields): boolean {
  const status = computeSubscriptionStatus(lab);
  return !status.is_suspended;
}

/**
 * Convenience: compute the increment that should happen on a successful
 * report creation.
 *
 *   - If lab is at/below cap: increment current_period_report_count
 *   - If lab is over cap: increment current_period_overage_count
 *
 * Returns which counter to bump and by how much. The transaction in
 * POST /api/reports applies this with FieldValue.increment().
 *
 * This function deliberately doesn't check is_suspended — the caller
 * (the API route) should have already gated on that. We only handle
 * the "report is allowed; which bucket does it land in?" decision.
 */
export function chooseUsageBucket(
  lab: LabSubscriptionFields,
): 'normal' | 'overage' {
  const status = computeSubscriptionStatus(lab);
  // PAYG (no cap) always lands in 'normal' — we still count for invoicing
  // but there's no overage concept.
  if (status.monthly_cap === null) return 'normal';
  // At-or-over cap → overage
  if (status.reports_used >= status.monthly_cap) return 'overage';
  return 'normal';
}
