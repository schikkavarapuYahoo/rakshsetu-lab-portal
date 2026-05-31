"use client";

import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OutlinedInput } from "@/components/ui/outlined-input";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { useBillingStore } from "@/lib/stores/billing";
import {
  MAX_PRICE_PER_REPORT_PAISE,
  MIN_PRICE_PER_REPORT_PAISE,
  paiseToRupees,
  rupeesToPaise,
} from "@/lib/utils/paise";

/**
 * /settings/billing — configure per-report price, low-balance warning
 * threshold, and the manual-suspend toggle. The suspend toggle exists
 * so the lab owner can pause publishing without changing balance (e.g.
 * stepping out, account audit in progress).
 */
export default function BillingSettingsPage() {
  const guard = useRoleGuard(["OWNER", "ADMIN"]);
  const price = useBillingStore((s) => s.pricePerReportPaise);
  const lowThreshold = useBillingStore((s) => s.lowBalanceThresholdPaise);
  const suspended = useBillingStore((s) => s.manuallySuspended);
  const updateSettings = useBillingStore((s) => s.updateSettings);
  const setSuspended = useBillingStore((s) => s.setSuspended);
  const reset = useBillingStore((s) => s.reset);
  const hasHydrated = useBillingStore.persist?.hasHydrated() ?? true;

  const [priceRupees, setPriceRupees] = useState(String(paiseToRupees(price)));
  const [thresholdRupees, setThresholdRupees] = useState(
    String(paiseToRupees(lowThreshold)),
  );

  useEffect(() => {
    if (!hasHydrated) return;
    setPriceRupees(String(paiseToRupees(price)));
    setThresholdRupees(String(paiseToRupees(lowThreshold)));
  }, [hasHydrated, price, lowThreshold]);

  function handleSave() {
    try {
      const newPrice = rupeesToPaise(Number(priceRupees));
      const newThreshold = rupeesToPaise(Number(thresholdRupees));
      if (
        newPrice < MIN_PRICE_PER_REPORT_PAISE ||
        newPrice > MAX_PRICE_PER_REPORT_PAISE
      ) {
        toast.error(
          `Per-report price must be between ₹${MIN_PRICE_PER_REPORT_PAISE / 100} and ₹${MAX_PRICE_PER_REPORT_PAISE / 100}`,
        );
        return;
      }
      updateSettings({
        pricePerReportPaise: newPrice,
        lowBalanceThresholdPaise: newThreshold,
      });
      toast.success("Billing settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleReset() {
    if (
      !confirm(
        "Reset billing? This wipes the balance, ledger, and settings back to the starter trial state.",
      )
    ) {
      return;
    }
    reset();
    toast.success("Billing reset to starter state");
  }

  if (guard === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  if (guard === "denied") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Billing settings are for the lab owner or admin. Redirecting…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/settings"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Billing settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Set how much each published report deducts from your credit
          balance, when to warn about a low balance, and pause publishing
          if you need to.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-6"
      >
        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Pricing
          </h2>
          <OutlinedInput
            label="Price per published report (₹)"
            type="number"
            inputMode="decimal"
            step={0.5}
            min={MIN_PRICE_PER_REPORT_PAISE / 100}
            max={MAX_PRICE_PER_REPORT_PAISE / 100}
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            helperText="Charged at the moment a report transitions to Published. Defaults to ₹6."
          />
          <OutlinedInput
            label="Low-balance warning (₹)"
            type="number"
            inputMode="decimal"
            step={50}
            min={0}
            value={thresholdRupees}
            onChange={(e) => setThresholdRupees(e.target.value)}
            helperText="When the balance falls below this, the billing chip turns amber. A common rule is ~10 reports' worth."
          />
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              Account status
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Manually suspend publishing without touching the balance.
              Useful for audits, owner-away days, or post-incident pauses.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50/50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={suspended}
              onChange={(e) => {
                setSuspended(e.target.checked);
                toast.success(
                  e.target.checked
                    ? "Lab account suspended — publishing blocked"
                    : "Lab account reactivated",
                );
              }}
            />
            <div className="text-sm">
              <div className="font-medium text-neutral-900">
                Suspend this lab account
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                Reports can still be created and collected; only the final
                &ldquo;Publish Report&rdquo; step is blocked.
              </div>
            </div>
          </label>
        </section>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset billing
          </button>
          <div className="flex items-center gap-2">
            <Link
              href="/billing"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors"
            >
              <Save className="h-4 w-4" />
              Save settings
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
