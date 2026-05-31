"use client";

import { ArrowLeft, Printer, Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo } from "react";

import { PrintableReport } from "@/components/reports/printable-report";
import "@/components/reports/printable-report.css";
import { useLabProfileStore } from "@/lib/stores/lab-profile";
import { usePatientsStore } from "@/lib/stores/patients";
import { useReportsStore } from "@/lib/stores/reports";

/**
 * /reports/visit/[visitId]/print
 *
 * Single PDF for a multi-test visit. When the patient came in for
 * CBC + Lipid + TSH, this route renders one consolidated document:
 * shared lab header, patient block, sample summary, then one
 * `ReportTestSection` per test, ending with a single signature
 * footer. Each extra test gets a page-break before it so the print
 * is clean.
 *
 * The primary report (used for header / patient / sample data) is the
 * report whose `reportCode` sorts first — that gives a deterministic
 * order. Future improvement: persist a `primaryReportId` on the visit
 * so the receptionist controls which test leads.
 */
export default function VisitPrintPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = use(params);

  const allReports = useReportsStore((s) => s.reports);
  const labProfile = useLabProfileStore((s) => s.profile);

  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true) &&
    (useLabProfileStore.persist?.hasHydrated() ?? true);

  const reportsInVisit = useMemo(
    () =>
      allReports
        .filter((r) => r.visitId === visitId)
        .sort((a, b) => a.reportCode.localeCompare(b.reportCode)),
    [allReports, visitId],
  );

  const primary = reportsInVisit[0];
  const patient = usePatientsStore((s) =>
    primary ? s.patients.find((p) => p.id === primary.patientId) : undefined,
  );

  if (!hasHydrated) {
    return (
      <div className="print-page-frame">
        <div className="text-muted-foreground p-6 text-sm">Loading…</div>
      </div>
    );
  }
  if (!primary) return notFound();

  const labProfileMissing = labProfile.labName.trim() === "";
  const additional = reportsInVisit.slice(1);
  const testCount = reportsInVisit.length;

  return (
    <div className="print-page-frame">
      <div className="print-toolbar">
        <Link
          href={`/reports/visit/${visitId}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to visit
        </Link>
        <div className="text-sm text-neutral-600">
          Visit · {testCount} test{testCount === 1 ? "" : "s"} ·{" "}
          {reportsInVisit.map((r) => r.reportCode).join(", ")}
        </div>
        <div className="actions">
          {labProfileMissing && (
            <Link
              href="/settings/lab-profile"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100"
            >
              <Settings className="h-4 w-4" />
              Configure lab profile
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="px-6">
        {labProfileMissing && (
          <div className="print-banner-warning mx-auto max-w-[800px]">
            <strong>Lab profile not configured.</strong> Set your lab name,
            address, and signatory under{" "}
            <Link
              href="/settings/lab-profile"
              className="underline underline-offset-2"
            >
              Settings → Lab profile
            </Link>{" "}
            before handing this PDF to a patient.
          </div>
        )}
        <PrintableReport
          report={primary}
          additionalReports={additional}
          patient={patient}
          labProfile={labProfile}
        />
      </div>
    </div>
  );
}
