"use client";

import { ArrowLeft, Printer, Receipt as ReceiptIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";

import { PrintableReceipt } from "@/components/reports/printable-receipt";
import "@/components/reports/printable-report.css";
import { useLabProfileStore } from "@/lib/stores/lab-profile";
import { usePatientsStore } from "@/lib/stores/patients";
import { useReportsStore } from "@/lib/stores/reports";

/**
 * /reports/[id]/receipt — printable payment receipt for the patient.
 * Only renders when the report has a payment recorded; otherwise shows
 * a hint to record one first. GST rate is configurable inline (defaults
 * to 0% — diagnostic services are typically exempt under HSN 9993).
 */
export default function ReportReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const report = useReportsStore((s) => s.reports.find((r) => r.id === id));
  const patient = usePatientsStore((s) =>
    report ? s.patients.find((p) => p.id === report.patientId) : undefined,
  );
  const labProfile = useLabProfileStore((s) => s.profile);
  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true) &&
    (useLabProfileStore.persist?.hasHydrated() ?? true);

  const [gstPercent, setGstPercent] = useState(0);

  if (!hasHydrated) {
    return (
      <div className="print-page-frame">
        <div className="text-muted-foreground p-6 text-sm">Loading…</div>
      </div>
    );
  }
  if (!report) return notFound();

  const hasPayment = Boolean(report.payment);

  return (
    <div className="print-page-frame">
      <div className="print-toolbar">
        <Link
          href={`/reports/${report.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to report
        </Link>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <ReceiptIcon className="h-4 w-4" />
          <span>
            Receipt · {report.reportCode} · {report.testName}
          </span>
        </div>
        <div className="actions flex items-center gap-2">
          {hasPayment && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              GST
              <select
                value={gstPercent}
                onChange={(e) => setGstPercent(Number(e.target.value))}
                className="focus:border-brand-500 h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none"
              >
                <option value={0}>Exempt (0%)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!hasPayment}
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="px-6">
        {!hasPayment && (
          <div className="print-banner-warning mx-auto max-w-[800px]">
            <strong>No payment recorded yet.</strong> Open{" "}
            <Link
              href={`/reports/${report.id}`}
              className="underline underline-offset-2"
            >
              the report
            </Link>{" "}
            and click <em>Record payment</em> first — then come back here to
            print the receipt.
          </div>
        )}
        <PrintableReceipt
          report={report}
          patient={patient}
          labProfile={labProfile}
          gstPercent={gstPercent}
        />
      </div>
    </div>
  );
}
