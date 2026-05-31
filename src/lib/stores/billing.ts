"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getCurrentUserSnapshot } from "@/lib/stores/auth";
import type { AuditStamp } from "@/lib/stores/patients";
import {
  DEFAULT_LOW_BALANCE_THRESHOLD_PAISE,
  DEFAULT_PRICE_PER_REPORT_PAISE,
  MAX_TOPUP_PAISE,
  MIN_TOPUP_PAISE,
  type Paise,
} from "@/lib/utils/paise";

/**
 * Subscription / credit-balance billing.
 *
 * Mirrors the SaaS model from the upstream project: the lab buys
 * credits (or gets a trial grant), spends 1 credit-equivalent per
 * published report, and tops up before the balance runs dry. The
 * lab is the customer; RakshSetu (the platform) is the vendor.
 *
 * This is a client-side stub — there is no real Razorpay integration
 * or backend ledger yet. The store mimics the shape the future
 * server-backed API would expose so the UI / debit hooks don't need
 * to change when the backend lands. Top-ups are simulated locally.
 */

export type LedgerDirection = "credit" | "debit";

export type LedgerReason =
  | "trial_grant" // initial / promotional credits, no money changed hands
  | "topup" // lab paid for credits (Razorpay)
  | "report_submission" // per-report debit when a report is Published
  | "compensation" // platform-issued credit (apology / make-good)
  | "manual_adjustment"; // catch-all for manual fixes

export interface LedgerEntry {
  id: string;
  direction: LedgerDirection;
  amountPaise: Paise;
  reason: LedgerReason;
  /** Balance immediately after this entry was applied. */
  balanceAfterPaise: Paise;
  /** Free-form per-reason metadata (report code, top-up reference, etc.). */
  metadata: Record<string, string | number | undefined>;
  /** Who recorded the entry (system actions still use the current user). */
  by: AuditStamp;
  createdAt: string;
}

export type BillingStatus = "active" | "low" | "suspended";

interface BillingState {
  balancePaise: Paise;
  pricePerReportPaise: Paise;
  lowBalanceThresholdPaise: Paise;
  /**
   * Lab self-reports as suspended (e.g. owner offline, account paused).
   * In a real backend this is platform-controlled; here it's manual.
   */
  manuallySuspended: boolean;
  /** Most-recent-first. */
  ledger: LedgerEntry[];

  // ── derived helpers (selectors) ────────────────────────────────
  getStatus: () => BillingStatus;

  // ── actions ────────────────────────────────────────────────────
  /** Add credits (top-up, trial, compensation). Validates min/max. */
  credit: (input: {
    amountPaise: Paise;
    reason: LedgerReason;
    metadata?: Record<string, string | number | undefined>;
  }) => LedgerEntry;
  /** Deduct credits. Returns the new entry or throws on insufficient balance. */
  debit: (input: {
    amountPaise: Paise;
    reason: LedgerReason;
    metadata?: Record<string, string | number | undefined>;
  }) => LedgerEntry;
  /** Update billing settings (per-report price + low-balance threshold). */
  updateSettings: (input: {
    pricePerReportPaise?: Paise;
    lowBalanceThresholdPaise?: Paise;
  }) => void;
  /** Toggle manual suspend (UI affordance only). */
  setSuspended: (suspended: boolean) => void;
  /** Wipe everything back to seed (Settings → reset button). */
  reset: () => void;
  /**
   * Replace local state with `labs/{labId}` balance + settings + last
   * 200 ledger entries from Firestore. Runs at app boot via
   * `StoreHydrationDriver`. Skips replacement when the server reports
   * zero ledger entries AND zero balance (first-launch — local seed
   * trial grant stays visible until the first real entry).
   */
  hydrateFromAPI: () => Promise<void>;
}

// ── REMOTE PERSISTENCE ────────────────────────────────────────────────
// credit / debit / updateSettings / setSuspended all flush to Firestore
// in the background. The server-side ledger entry is the source of
// truth; local mutation runs first so the UI updates immediately, and
// the next hydration reconciles if anything diverged.

function persistEntryRemote(input: {
  direction: LedgerDirection;
  amountPaise: Paise;
  reason: LedgerReason;
  metadata?: Record<string, string | number | undefined>;
  by: AuditStamp;
}): void {
  // Filter out undefined keys from metadata — Zod's record schema
  // accepts only string|number values, so undefined would fail
  // validation server-side.
  const cleanMeta: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    if (v !== undefined) cleanMeta[k] = v;
  }
  void fetch("/api/billing/entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, metadata: cleanMeta }),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[billing] entry POST failed: ${res.status}`);
    })
    .catch((err) => console.warn("[billing] entry POST threw:", err));
}

function persistSettingsRemote(patch: {
  pricePerReportPaise?: Paise;
  lowBalanceThresholdPaise?: Paise;
  manuallySuspended?: boolean;
}): void {
  void fetch("/api/billing/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[billing] state POST failed: ${res.status}`);
    })
    .catch((err) => console.warn("[billing] state POST threw:", err));
}

function currentStamp(): AuditStamp {
  const u = getCurrentUserSnapshot();
  return { userId: u.id, userName: u.name, at: new Date().toISOString() };
}

function makeId(): string {
  // Browser-safe random id — billing ledger doesn't need cryptographic
  // strength, just collision avoidance within a single lab's history.
  return `led-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const SEED_TRIAL_PAISE: Paise = 100_000; // ₹1,000 starter credits

function seedLedger(): LedgerEntry[] {
  // Single trial-grant entry so the table isn't empty on first paint.
  // Stamped at first-hydration time — keeps the timeline coherent.
  const stamp = currentStamp();
  return [
    {
      id: makeId(),
      direction: "credit",
      amountPaise: SEED_TRIAL_PAISE,
      reason: "trial_grant",
      balanceAfterPaise: SEED_TRIAL_PAISE,
      metadata: {
        note: "Welcome to RakshSetu — starter credits to get the lab moving.",
      },
      by: stamp,
      createdAt: stamp.at,
    },
  ];
}

const INITIAL: Pick<
  BillingState,
  "balancePaise" | "pricePerReportPaise" | "lowBalanceThresholdPaise" | "manuallySuspended" | "ledger"
> = {
  balancePaise: SEED_TRIAL_PAISE,
  pricePerReportPaise: DEFAULT_PRICE_PER_REPORT_PAISE,
  lowBalanceThresholdPaise: DEFAULT_LOW_BALANCE_THRESHOLD_PAISE,
  manuallySuspended: false,
  ledger: [],
};

export class InsufficientBalanceError extends Error {
  constructor(
    public balancePaise: Paise,
    public requestedPaise: Paise,
  ) {
    super(
      `Insufficient balance: have ${balancePaise} paise, need ${requestedPaise}`,
    );
    this.name = "InsufficientBalanceError";
  }
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      getStatus: (): BillingStatus => {
        const s = get();
        if (s.manuallySuspended) return "suspended";
        if (s.balancePaise < s.lowBalanceThresholdPaise) return "low";
        return "active";
      },

      credit: ({ amountPaise, reason, metadata }) => {
        if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
          throw new Error(
            `credit: amountPaise must be a positive integer, got ${amountPaise}`,
          );
        }
        if (reason === "topup") {
          if (amountPaise < MIN_TOPUP_PAISE || amountPaise > MAX_TOPUP_PAISE) {
            throw new Error(
              `Top-up must be between ₹${MIN_TOPUP_PAISE / 100} and ₹${MAX_TOPUP_PAISE / 100}`,
            );
          }
        }
        const stamp = currentStamp();
        const newBalance = get().balancePaise + amountPaise;
        const entry: LedgerEntry = {
          id: makeId(),
          direction: "credit",
          amountPaise,
          reason,
          balanceAfterPaise: newBalance,
          metadata: metadata ?? {},
          by: stamp,
          createdAt: stamp.at,
        };
        set((s) => ({
          balancePaise: newBalance,
          ledger: [entry, ...s.ledger],
        }));
        persistEntryRemote({ direction: "credit", amountPaise, reason, metadata, by: stamp });
        return entry;
      },

      debit: ({ amountPaise, reason, metadata }) => {
        if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
          throw new Error(
            `debit: amountPaise must be a positive integer, got ${amountPaise}`,
          );
        }
        const current = get().balancePaise;
        if (amountPaise > current) {
          throw new InsufficientBalanceError(current, amountPaise);
        }
        const stamp = currentStamp();
        const newBalance = current - amountPaise;
        const entry: LedgerEntry = {
          id: makeId(),
          direction: "debit",
          amountPaise,
          reason,
          balanceAfterPaise: newBalance,
          metadata: metadata ?? {},
          by: stamp,
          createdAt: stamp.at,
        };
        set((s) => ({
          balancePaise: newBalance,
          ledger: [entry, ...s.ledger],
        }));
        persistEntryRemote({ direction: "debit", amountPaise, reason, metadata, by: stamp });
        return entry;
      },

      updateSettings: ({ pricePerReportPaise, lowBalanceThresholdPaise }) => {
        set((s) => ({
          pricePerReportPaise: pricePerReportPaise ?? s.pricePerReportPaise,
          lowBalanceThresholdPaise:
            lowBalanceThresholdPaise ?? s.lowBalanceThresholdPaise,
        }));
        persistSettingsRemote({ pricePerReportPaise, lowBalanceThresholdPaise });
      },

      setSuspended: (suspended) => {
        set({ manuallySuspended: suspended });
        persistSettingsRemote({ manuallySuspended: suspended });
      },

      reset: () => {
        const ledger = seedLedger();
        set({
          ...INITIAL,
          balancePaise: SEED_TRIAL_PAISE,
          ledger,
        });
      },

      hydrateFromAPI: async () => {
        const res = await fetch("/api/billing/state", { cache: "no-store" });
        if (res.status === 401) return;
        if (!res.ok) throw new Error(`GET /api/billing/state ${res.status}`);
        const body = (await res.json()) as {
          balancePaise?: number;
          pricePerReportPaise?: number | null;
          lowBalanceThresholdPaise?: number | null;
          manuallySuspended?: boolean;
          ledger?: LedgerEntry[];
        };
        // First-launch guard: server has nothing yet → keep the seed
        // trial grant so the lab sees ₹1,000 of starter credits on
        // the billing page. Future entries will write the ledger and
        // future hydrations will start replacing.
        if (
          (body.ledger?.length ?? 0) === 0 &&
          (body.balancePaise ?? 0) === 0
        ) {
          return;
        }
        set((s) => ({
          balancePaise: (body.balancePaise as Paise) ?? s.balancePaise,
          pricePerReportPaise:
            (body.pricePerReportPaise as Paise | undefined) ??
            s.pricePerReportPaise,
          lowBalanceThresholdPaise:
            (body.lowBalanceThresholdPaise as Paise | undefined) ??
            s.lowBalanceThresholdPaise,
          manuallySuspended: body.manuallySuspended ?? s.manuallySuspended,
          ledger: body.ledger ?? s.ledger,
        }));
      },
    }),
    {
      name: "rakshsetu-billing",
      version: 1,
      partialize: (state) => ({
        balancePaise: state.balancePaise,
        pricePerReportPaise: state.pricePerReportPaise,
        lowBalanceThresholdPaise: state.lowBalanceThresholdPaise,
        manuallySuspended: state.manuallySuspended,
        ledger: state.ledger,
      }),
      onRehydrateStorage: () => (state) => {
        // First-ever load — seed the trial grant so the ledger isn't
        // empty. Subsequent loads (ledger already populated) leave the
        // existing data alone.
        if (state && state.ledger.length === 0) {
          const seeded = seedLedger();
          state.ledger = seeded;
          state.balancePaise = SEED_TRIAL_PAISE;
        }
      },
    },
  ),
);

export const REASON_LABEL: Record<LedgerReason, string> = {
  trial_grant: "Trial credits granted",
  topup: "Top-up",
  report_submission: "Report submitted",
  compensation: "Compensation credit",
  manual_adjustment: "Manual adjustment",
};
