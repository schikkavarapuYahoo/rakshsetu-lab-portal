"use client";

import { ArrowLeft, Printer, Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";

import { PrintableReport } from "@/components/reports/printable-report";
import "@/components/reports/printable-report.css";
import { useLabProfileStore } from "@/lib/stores/lab-profile";
import { usePatientsStore } from "@/lib/stores/patients";
import { useReportsStore } from "@/lib/stores/reports";

export default function ReportPrintPage({
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

  if (!hasHydrated) {
    return (
      <div className="print-page-frame">
        <div className="text-muted-foreground p-6 text-sm">Loading…</div>
      </div>
    );
  }
  if (!report) return notFound();

  const labProfileMissing = labProfile.labName.trim() === "";

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
        <div className="text-sm text-neutral-600">
          {report.reportCode} · {report.testName}
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
          report={report}
          patient={patient}
          labProfile={labProfile}
        />
      </div>
    </div>
  );
}
