"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Info,
  Lock,
  Plus,
  Settings,
  Stethoscope,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";

import {
  REASON_LABEL,
  useBillingStore,
  type LedgerEntry,
} from "@/lib/stores/billing";
import {
  formatRupees,
  reportsAffordable,
  type Paise,
} from "@/lib/utils/paise";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { cn } from "@/lib/utils";

/**
 * /billing — lab self-service subscription billing.
 *
 * Mirrors the upstream layout: balance hero → top-up presets → ledger
 * table. The data layer is the client-side `useBillingStore` (zustand,
 * persisted to localStorage). When a real backend lands this page can
 * keep its props shape and just swap the store for a server fetcher.
 */

const TOPUP_PRESETS: { label: string; paise: Paise }[] = [
  { label: "₹500", paise: 50_000 },
  { label: "₹1,000", paise: 100_000 },
  { label: "₹2,500", paise: 250_000 },
  { label: "₹5,000", paise: 500_000 },
];

export default function BillingPage() {
  const guard = useRoleGuard(["OWNER", "ADMIN"]);
  const balance = useBillingStore((s) => s.balancePaise);
  const price = useBillingStore((s) => s.pricePerReportPaise);
  const ledger = useBillingStore((s) => s.ledger);
  const credit = useBillingStore((s) => s.credit);
  const status = useBillingStore((s) => s.getStatus());
  const hasHydrated = useBillingStore.persist?.hasHydrated() ?? true;

  const reportsLeft = useMemo(
    () => (price > 0 ? reportsAffordable(balance, price) : 0),
    [balance, price],
  );
  const suspended = status === "suspended";
  const lastEvent = ledger[0]?.createdAt ?? null;

  function handleTopup(paise: Paise) {
    try {
      // Generate a unique demo order id. Using crypto.randomUUID is
      // impure but is OK here — this runs only in response to a click,
      // never during render. Pattern matches what Razorpay would
      // return as an order id once the real integration lands.
      const demoOrderId = `DEMO${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
      credit({
        amountPaise: paise,
        reason: "topup",
        metadata: {
          razorpay_order_id: demoOrderId,
          note: "Simulated top-up (no real payment processed).",
        },
      });
      toast.success(`Added ${formatRupees(paise)} to your balance`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  if (!hasHydrated || guard === "loading") {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  if (guard === "denied") {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Billing is for the lab owner or admin. Redirecting…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-400 px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Credits, top-ups, and transaction history. Each published report
            debits {formatRupees(price)} from the balance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/billing/doctors"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
          >
            <Stethoscope className="h-4 w-4" />
            Referring doctors
          </Link>
          <Link
            href="/settings/billing"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
          >
            <Settings className="h-4 w-4" />
            Billing settings
          </Link>
        </div>
      </header>

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <strong>Demo mode.</strong> No payment processor is wired up yet —
        top-ups simulate locally so you can exercise the workflow. When the
        backend lands, the same UI hooks into Razorpay without changes.
      </div>

      {suspended && (
        <div className="mb-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <div className="font-semibold text-red-900">
              This lab account is suspended
            </div>
            <div className="mt-1 text-sm text-red-700">
              You cannot publish new reports until the account is reactivated
              from <Link href="/settings/billing" className="underline">Billing settings</Link>.
            </div>
          </div>
        </div>
      )}

      {/* BALANCE HERO */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-neutral-500 uppercase">
              <Wallet className="h-3.5 w-3.5" />
              Current balance
            </div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-neutral-900">
              {formatRupees(balance)}
            </div>
            <div className="mt-2 text-sm text-neutral-600">
              {reportsLeft > 0 ? (
                <>
                  About{" "}
                  <strong>{reportsLeft.toLocaleString("en-IN")}</strong> more{" "}
                  {reportsLeft === 1 ? "report" : "reports"} at your current
                  price of {formatRupees(price)} each
                </>
              ) : (
                <span className="font-medium text-red-600">
                  Not enough credits to publish a report. Top up to continue.
                </span>
              )}
            </div>
          </div>
          <StatusChip status={status} />
        </div>

        {lastEvent && (
          <div className="mt-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
            Last balance change:{" "}
            {new Date(lastEvent).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        )}
      </section>

      {/* TOP-UP SECTION */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-900">
            Add credits
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Tap a preset to add credits to your balance. Real payment
            integration ships with the backend.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOPUP_PRESETS.map((p) => (
            <button
              key={p.paise}
              type="button"
              onClick={() => handleTopup(p.paise)}
              disabled={suspended}
              className="border-brand-200 text-brand-700 hover:bg-brand-50 inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title={
                suspended
                  ? "Reactivate the account before topping up"
                  : `Add ${p.label} to the balance`
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Minimum ₹500 per top-up. Maximum ₹1,00,000. For larger grants the
          backend will require admin approval.
        </p>
      </section>

      {/* TRANSACTION HISTORY */}
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-900">
            Transaction history
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Every credit and debit on the account, newest first.
          </p>
        </div>

        {ledger.length === 0 ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-neutral-500">
            <Info className="h-4 w-4" />
            No transactions yet — the first top-up or report publish will
            appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/80">
                <tr className="border-b border-neutral-100 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  <th className="px-6 py-3 text-left font-medium">When</th>
                  <th className="px-6 py-3 text-left font-medium">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">
                    Balance after
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <LedgerRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusChip({ status }: { status: "active" | "low" | "suspended" }) {
  if (status === "suspended") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
        <Lock className="h-3 w-3" />
        Suspended
      </div>
    );
  }
  if (status === "low") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
        <AlertTriangle className="h-3 w-3" />
        Low balance
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      Active
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.direction === "credit";
  const sign = isCredit ? "+" : "−";
  const amountClass = isCredit ? "text-emerald-700" : "text-neutral-900";
  const Icon = isCredit ? ArrowDownToLine : ArrowUpFromLine;
  const iconBg = isCredit
    ? "bg-emerald-100 text-emerald-700"
    : "bg-neutral-100 text-neutral-600";

  const secondary = describeEntry(entry);

  return (
    <tr className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/40">
      <td className="px-6 py-3 align-top whitespace-nowrap text-neutral-600">
        {new Date(entry.createdAt).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </td>
      <td className="px-6 py-3 align-top">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              iconBg,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-neutral-900">
              {REASON_LABEL[entry.reason]}
            </div>
            {secondary && (
              <div className="mt-0.5 truncate text-xs text-neutral-500">
                {secondary}
              </div>
            )}
          </div>
        </div>
      </td>
      <td
        className={cn(
          "px-6 py-3 text-right align-top font-semibold tabular-nums",
          amountClass,
        )}
      >
        {sign}
        {formatRupees(entry.amountPaise)}
      </td>
      <td className="px-6 py-3 text-right align-top tabular-nums text-neutral-600">
        {formatRupees(entry.balanceAfterPaise)}
      </td>
    </tr>
  );
}

function describeEntry(entry: LedgerEntry): string | null {
  const m = entry.metadata;
  switch (entry.reason) {
    case "report_submission": {
      const code = typeof m.report_code === "string" ? m.report_code : null;
      const test = typeof m.test_name === "string" ? m.test_name : null;
      const parts: string[] = [];
      if (code) parts.push(code);
      if (test) parts.push(test);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "topup": {
      const ref =
        typeof m.razorpay_order_id === "string" ? m.razorpay_order_id : null;
      return ref ? `Order ${ref}` : null;
    }
    case "trial_grant":
    case "compensation":
    case "manual_adjustment": {
      const note = typeof m.note === "string" ? m.note : null;
      return note;
    }
    default:
      return null;
  }
}
