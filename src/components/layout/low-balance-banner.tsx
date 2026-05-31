"use client";

import { AlertTriangle, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBillingStore } from "@/lib/stores/billing";
import { formatRupees, reportsAffordable } from "@/lib/utils/paise";

/**
 * Site-wide warning that the lab's credit balance is low or suspended.
 * Renders below the AppHeader on every page, so a tech can see the
 * problem from any screen (not just /billing). Auto-hides on the
 * billing pages themselves — once you're already there, the banner
 * is redundant noise.
 */
export function LowBalanceBanner() {
  const pathname = usePathname();
  const status = useBillingStore((s) => s.getStatus());
  const balance = useBillingStore((s) => s.balancePaise);
  const price = useBillingStore((s) => s.pricePerReportPaise);
  const hasHydrated = useBillingStore.persist?.hasHydrated() ?? true;

  if (!hasHydrated) return null;
  if (status === "active") return null;
  // Don't double-up on the billing pages — they already show the warning.
  if (pathname.startsWith("/billing")) return null;
  if (pathname.startsWith("/settings/billing")) return null;
  // Auth pages + admin console own their own chrome — don't bleed the
  // lab-balance banner across them.
  if (pathname.startsWith("/login")) return null;
  if (pathname.startsWith("/staff-login")) return null;
  if (pathname.startsWith("/admin")) return null;

  const reportsLeft = price > 0 ? reportsAffordable(balance, price) : 0;

  if (status === "suspended") {
    return (
      <div className="border-b border-red-200 bg-red-50">
        <div className="mx-auto flex w-full max-w-400 items-center gap-3 px-6 py-2.5 text-sm text-red-900">
          <Lock className="h-4 w-4 shrink-0 text-red-600" />
          <span className="flex-1">
            <strong className="font-semibold">Lab account is suspended.</strong>{" "}
            Reports can be created and processed, but publishing is blocked
            until the account is reactivated.
          </span>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-1 font-medium text-red-700 hover:text-red-900 underline-offset-2 hover:underline"
          >
            Reactivate
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // status === "low"
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex w-full max-w-400 items-center gap-3 px-6 py-2.5 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="flex-1">
          <strong className="font-semibold">Low credit balance.</strong> Only{" "}
          <strong>{formatRupees(balance)}</strong> remaining —{" "}
          {reportsLeft > 0 ? (
            <>
              about{" "}
              <strong>{reportsLeft.toLocaleString("en-IN")}</strong>{" "}
              {reportsLeft === 1 ? "report" : "reports"} can still be published
              before top-up is required.
            </>
          ) : (
            <>not enough credits to publish another report.</>
          )}
        </span>
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 font-medium text-amber-800 hover:text-amber-900 underline-offset-2 hover:underline"
        >
          Top up
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
