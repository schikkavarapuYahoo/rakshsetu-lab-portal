/**
 * Paise — integer money type used by the billing module.
 *
 * Every monetary value in the billing flow is stored, reasoned about,
 * and persisted as INTEGER paise (₹1 = 100 paise). Rupees are
 * display-only. This avoids the IEEE-754 drift that bites any
 * float-based money implementation after a few thousand transactions.
 *
 * Ported from the upstream project's `src/lib/paise.ts`. Kept
 * intentionally close to that source so when we hook up a real
 * backend later, the math layer doesn't need to change.
 */

/** Integer paise. 100 paise = ₹1. */
export type Paise = number;

/** Rupees as a floating-point number. Only used at display / input edges. */
export type Rupees = number;

const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: Rupees): Paise {
  if (typeof rupees !== "number" || !Number.isFinite(rupees)) {
    throw new Error(`rupeesToPaise: expected finite number, got ${rupees}`);
  }
  if (rupees < 0) {
    throw new Error(`rupeesToPaise: negative not allowed, got ${rupees}`);
  }
  const scaled = rupees * PAISE_PER_RUPEE;
  const paise = Math.round(scaled);
  const drift = Math.abs(paise - scaled);
  if (drift > 1e-6) {
    throw new Error(
      `rupeesToPaise: ${rupees} has more precision than 1 paisa; round explicitly`,
    );
  }
  return paise;
}

export function paiseToRupees(paise: Paise): Rupees {
  assertPaise(paise);
  return paise / PAISE_PER_RUPEE;
}

/**
 * Format paise as a user-facing rupee string with the ₹ symbol and
 * Indian thousands grouping (1,00,000 not 100,000). Always shows
 * 2 decimals so balances look stable in the UI.
 */
export function formatRupees(paise: Paise): string {
  assertPaise(paise);
  const rupees = paise / PAISE_PER_RUPEE;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `₹${formatted}`;
}

/** Compact display for tight UI: ₹1.5K / ₹2.4L / ₹1.2Cr. */
export function formatRupeesCompact(paise: Paise): string {
  assertPaise(paise);
  const rupees = paise / PAISE_PER_RUPEE;
  if (rupees < 1000) return formatRupees(paise);
  if (rupees < 100_000) return `₹${(rupees / 1000).toFixed(1)}K`;
  if (rupees < 10_000_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
  return `₹${(rupees / 10_000_000).toFixed(1)}Cr`;
}

/** How many reports a balance can fund at the given price. Floor. */
export function reportsAffordable(
  balancePaise: Paise,
  pricePerReportPaise: Paise,
): number {
  assertPaise(balancePaise);
  assertPaise(pricePerReportPaise);
  if (pricePerReportPaise <= 0) {
    throw new Error("reportsAffordable: pricePerReport must be positive");
  }
  return Math.floor(balancePaise / pricePerReportPaise);
}

export function assertPaise(value: unknown): asserts value is Paise {
  if (typeof value !== "number") {
    throw new Error(`assertPaise: expected number, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`assertPaise: expected finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`assertPaise: expected integer paise, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`assertPaise: expected non-negative paise, got ${value}`);
  }
  if (value > 1e11) {
    throw new Error(
      `assertPaise: value ${value} exceeds sane upper bound (10^11 paise)`,
    );
  }
}

export const DEFAULT_PRICE_PER_REPORT_PAISE: Paise = 600; // ₹6
export const DEFAULT_LOW_BALANCE_THRESHOLD_PAISE: Paise = 6000; // ₹60
export const MIN_TOPUP_PAISE: Paise = 50_000; // ₹500
export const MAX_TOPUP_PAISE: Paise = 10_000_000; // ₹1,00,000
export const MIN_PRICE_PER_REPORT_PAISE: Paise = 100; // ₹1
export const MAX_PRICE_PER_REPORT_PAISE: Paise = 5000; // ₹50
