import { NextResponse } from 'next/server';
import { adminDb } from '@/server/firebase-admin';
import { requireLabSession } from '@/server/auth/session';
import {
  DEFAULT_PRICE_PER_REPORT_PAISE,
  DEFAULT_LOW_BALANCE_THRESHOLD_PAISE,
} from '@/lib/paise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/balance
 *
 * The lab's current credit state. Powers:
 *   - The /billing page hero ("₹450.00 / 75 reports remaining")
 *   - The dashboard widget
 *   - Pre-flight check on /reports/new (block submission if balance
 *     would go negative — done by the API but the UI does a soft
 *     check first to avoid a wasted form submission)
 *
 * Lab session only. The check below narrows the union after
 * requireLabSession; a staff session reaching this URL gets a 403.
 *
 * Returns:
 *   {
 *     balance_paise: number,
 *     price_per_report_paise: number,
 *     low_balance_threshold_paise: number,
 *     low_balance: boolean,
 *     billing_status: 'active' | 'suspended' | 'trial',
 *     reports_affordable: number,
 *     last_event_at: string | null,    // ISO datetime
 *   }
 *
 * NOT included:
 *   - Ledger entries → use /api/billing/ledger for that
 *   - Trial credits granted → that's an internal accounting
 *     metric, not something the lab needs to see in normal use
 *   - Pricing history → also not needed for normal use; admin
 *     view via /api/admin/billing/[lab_id]/ledger
 */
export async function GET() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json(
      { error: 'Lab session required' },
      { status: 403 }
    );
  }

  const labRef = adminDb().collection('labs').doc(session.lab_id);
  const labSnap = await labRef.get();
  if (!labSnap.exists) {
    // Session points to a deleted lab. Shouldn't happen in practice
    // (deleting a lab should also kill its sessions) but defending
    // here is cheap.
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
  }

  const lab = labSnap.data() as {
    credit_balance?: number;
    per_report_paise?: number;
    low_balance_threshold_paise?: number;
    billing_status?: string;
    last_credit_event_at?: { toDate?: () => Date };
  };

  const balancePaise =
    typeof lab.credit_balance === 'number' ? lab.credit_balance : 0;
  const pricePaise =
    typeof lab.per_report_paise === 'number'
      ? lab.per_report_paise
      : DEFAULT_PRICE_PER_REPORT_PAISE;
  const lowBalanceThresholdPaise =
    typeof lab.low_balance_threshold_paise === 'number'
      ? lab.low_balance_threshold_paise
      : DEFAULT_LOW_BALANCE_THRESHOLD_PAISE;
  const billingStatus = lab.billing_status ?? 'active';

  // Affordable reports — floor division. Lab can submit this many
  // more reports before hitting INSUFFICIENT_CREDITS. Useful for
  // the UI hero ("75 reports remaining at your current price").
  const reportsAffordable =
    pricePaise > 0 ? Math.floor(balancePaise / pricePaise) : 0;

  return NextResponse.json({
    balance_paise: balancePaise,
    price_per_report_paise: pricePaise,
    low_balance_threshold_paise: lowBalanceThresholdPaise,
    low_balance: balancePaise < lowBalanceThresholdPaise,
    billing_status: billingStatus,
    reports_affordable: reportsAffordable,
    last_event_at:
      lab.last_credit_event_at?.toDate?.()?.toISOString?.() ?? null,
  });
}
