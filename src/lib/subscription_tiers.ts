/**
 * Subscription tier definitions for lab partners.
 *
 * Single source of truth — all pricing logic across the portal, billing
 * enforcement, admin UI, and reporting reads from here. Changing a
 * tier (price, cap, etc.) updates the entire system.
 *
 * Pricing model (Round 9 — manual cash/UPI collection, no Razorpay):
 *   - Sales rep talks to lab, agrees on tier
 *   - Lab pays via UPI/cash/cheque/bank transfer
 *   - Admin records the payment in the portal, which activates/extends
 *     the lab's subscription
 *   - Lab can use the portal up to their tier cap
 *   - Beyond cap, reports continue uploading but tracked as overage
 *     (settled in next billing cycle at ₹5/report)
 *   - On expiration: 7-day grace period with banner, then read-only
 *     suspension until next payment
 *
 * Why these specific tiers:
 *   See sales pricing analysis in CHANGES.md Round 9.
 *   Tier ladder calibrated to "reports per day" (the question labs
 *   actually answer): <10/day → Basic, ~15/day → Standard, ~20+/day
 *   → Growth, ~30-80/day → Premium, more → PAYG.
 *
 * All amounts in PAISE (integer) to avoid floating-point errors. UI
 * formats as ₹ for display only.
 */

/** Subscription tier identifier. Persisted on labs/{id}.subscription_plan. */
export type SubscriptionTier =
  | 'basic'
  | 'standard'
  | 'growth'
  | 'premium'
  | 'payg';

/** Billing cycle. Persisted on labs/{id}.subscription_billing_cycle. */
export type BillingCycle = 'monthly' | 'annual';

/** Effective subscription state, computed from date fields. NOT persisted. */
export type SubscriptionState =
  | 'unset'           // newly-created lab, no plan ever assigned
  | 'active'          // currently paid, within billing period, not yet at cap
  | 'active_overage'  // currently paid but past monthly cap (still functional)
  | 'grace_period'    // billing period ended, 7-day grace (banner shown)
  | 'suspended_readonly'; // grace expired, no new uploads until reactivated

export interface TierDefinition {
  id: SubscriptionTier;
  display_name: string;
  /** Monthly price in paise. ₹1 = 100 paise. */
  monthly_price_paise: number;
  /**
   * Annual price in paise. ~15% off monthly × 12.
   *
   * Why annual is offered: gives labs a discount AND gives us cash
   * upfront. Both sides win when the lab is confident in the product.
   */
  annual_price_paise: number;
  /**
   * Monthly report cap. null = unlimited (only for PAYG).
   *
   * Reports beyond cap continue uploading but accrue as overage,
   * billed at OVERAGE_PRICE_PAISE per report at next settlement.
   */
  monthly_report_cap: number | null;
  /** Hint shown in tier-selection UI to help labs self-select. */
  recommended_for_volume: string;
}

/** Per-overage-report price in paise. Same for all tiers. ₹5. */
export const OVERAGE_PRICE_PAISE = 500;

/**
 * Pay-as-you-go per-report price in paise. ₹5.
 *
 * PAYG labs don't have a monthly fee; they're billed at end-of-month
 * for total reports × this price. Used for very high volume labs that
 * exceed Premium tier.
 */
export const PAYG_PRICE_PER_REPORT_PAISE = 500;

/** Grace period after subscription expires, before read-only suspension. */
export const GRACE_PERIOD_DAYS = 7;

/**
 * Annual prepay discount. Labs paying for a full year get this off
 * their would-be monthly × 12 total. Not a coupon — baked into
 * `annual_price_paise` below.
 */
export const ANNUAL_DISCOUNT_PERCENT = 15;

/**
 * Tier catalog. Order matters — used for ascending display in UI.
 *
 * Maintenance note: if you change a tier price, also update the
 * marketing pricing page on rakshsetu.com/labs and run the parity
 * test in __tests__/tier_parity.test.ts (TODO: not yet written).
 */
export const TIERS: TierDefinition[] = [
  {
    id: 'basic',
    display_name: 'Basic',
    monthly_price_paise: 100_000, // ₹1,000
    annual_price_paise: 1_020_000, // ₹10,200 (15% off ₹12,000)
    monthly_report_cap: 300,
    recommended_for_volume: 'Up to ~10 reports/day',
  },
  {
    id: 'standard',
    display_name: 'Standard',
    monthly_price_paise: 150_000, // ₹1,500
    annual_price_paise: 1_530_000, // ₹15,300
    monthly_report_cap: 500,
    recommended_for_volume: '10–15 reports/day',
  },
  {
    id: 'growth',
    display_name: 'Growth',
    monthly_price_paise: 400_000, // ₹4,000
    annual_price_paise: 4_080_000, // ₹40,800
    monthly_report_cap: 1000,
    recommended_for_volume: '20–30 reports/day',
  },
  {
    id: 'premium',
    display_name: 'Premium',
    monthly_price_paise: 800_000, // ₹8,000
    annual_price_paise: 8_160_000, // ₹81,600
    monthly_report_cap: 2500,
    recommended_for_volume: '30–80 reports/day',
  },
  {
    id: 'payg',
    display_name: 'Pay-as-you-go',
    monthly_price_paise: 0, // no monthly fee; billed at end-of-month
    annual_price_paise: 0,
    monthly_report_cap: null, // unlimited
    recommended_for_volume: '80+ reports/day or unpredictable volume',
  },
];

/**
 * Look up a tier by id. Throws if not found — callers should always
 * have a known-good tier id from the catalog or the data model.
 */
export function getTier(id: SubscriptionTier): TierDefinition {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) {
    throw new Error(`Unknown subscription tier: ${id}`);
  }
  return tier;
}

/**
 * Effective price for a tier at a given billing cycle. Returns paise.
 * For PAYG, returns 0 (PAYG doesn't have a periodic fee).
 */
export function getTierPrice(
  id: SubscriptionTier,
  cycle: BillingCycle,
): number {
  const tier = getTier(id);
  return cycle === 'annual' ? tier.annual_price_paise : tier.monthly_price_paise;
}

/**
 * Compute the next expiration date given an effective-from date and
 * billing cycle. Used by the admin "record payment" flow.
 *
 * Convention: monthly = +1 calendar month, annual = +1 calendar year.
 * Edge case: paying on Jan 31 for "1 month" → Feb 28/29. We use
 * Date.setMonth which handles this correctly (clamps to last day of
 * shorter month).
 */
export function computeExpiresAt(
  effectiveFrom: Date,
  cycle: BillingCycle,
): Date {
  const expires = new Date(effectiveFrom);
  if (cycle === 'monthly') {
    expires.setMonth(expires.getMonth() + 1);
  } else {
    expires.setFullYear(expires.getFullYear() + 1);
  }
  return expires;
}
