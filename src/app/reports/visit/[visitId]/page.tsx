"use client";

import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Stethoscope,
  TestTube2,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/reports/status-pill";
import { ReportProgress } from "@/components/reports/report-progress";
import {
  getPatientFullName,
  usePatientsStore,
} from "@/lib/stores/patients";
import {
  FLAG_TONE,
  useReportsStore,
  type Report,
  type ResultRow,
} from "@/lib/stores/reports";
import { flagForValue } from "@/lib/utils/auto-flag";
import { deriveAutoValues } from "@/lib/utils/auto-formulas";
import { cn, formatDateOnly } from "@/lib/utils";

/**
 * /reports/visit/[visitId] — multi-test results entry for a single
 * patient visit.
 *
 * When the patient walks in with CBC + Lipid + Thyroid + HbA1c, the
 * tech wants to flip between tests in one screen rather than opening
 * 4 separate report pages. This route gathers every report sharing a
 * visitId and stacks them in collapsible cards so results can be
 * entered across all in one sitting.
 *
 * Auto-flag + auto-formula behaviour matches the inline editor on the
 * single-report detail page — value/range changes re-flag, and known
 * derived parameters (LDL, VLDL, eAG, Indirect Bilirubin, etc.)
 * populate as inputs are typed.
 */

type FlagValue = "" | "Low" | "Normal" | "High" | "Critical";

interface EditableRow {
  id: string;
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: FlagValue;
  autoFlagged?: boolean;
  autoDerived?: boolean;
}

type RowsByReport = Record<string, EditableRow[]>;

export default function VisitEditorPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = use(params);
  const router = useRouter();
  const allReports = useReportsStore((s) => s.reports);
  const updateReport = useReportsStore((s) => s.updateReport);
  const sendForReview = useReportsStore((s) => s.sendForReview);
  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true);

  const reports = useMemo(
    () =>
      allReports
        .filter((r) => r.visitId === visitId)
        .sort((a, b) => a.reportCode.localeCompare(b.reportCode)),
    [allReports, visitId],
  );

  const patientId = reports[0]?.patientId;
  const patient = usePatientsStore((s) =>
    patientId ? s.patients.find((p) => p.id === patientId) : undefined,
  );

  const [rowsByReport, setRowsByReport] = useState<RowsByReport>(() => {
    const out: RowsByReport = {};
    for (const r of reports) {
      out[r.id] = r.results.map((row) => ({
        id: row.id,
        parameter: row.parameter,
        value: row.value ?? "",
        unit: row.unit ?? "",
        referenceRange: row.referenceRange ?? "",
        flag: (row.flag ?? "") as FlagValue,
        autoFlagged: false,
        autoDerived: false,
      }));
    }
    return out;
  });

  // Collapsible state — each report card defaults open. Tech can fold
  // the ones they've finished. Persists nothing — fresh slate per visit.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!hasHydrated) {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }
  if (reports.length === 0) return notFound();

  const editableReports = reports.filter(
    (r) =>
      r.status === "Waiting for Results" ||
      r.status === "Sample Collected" ||
      r.status === "Review",
  );

  function updateRow(
    reportId: string,
    idx: number,
    patch: Partial<EditableRow>,
  ) {
    setRowsByReport((prev) => {
      const reportRows = prev[reportId];
      if (!reportRows) return prev;
      // Step 1: apply patch + auto-flag the directly-edited row
      const step1 = reportRows.map((r, i) => {
        if (i !== idx) return r;
        const next: EditableRow = { ...r, ...patch };
        if ("flag" in patch) next.autoFlagged = false;
        if ("value" in patch) next.autoDerived = false;
        if ("value" in patch || "referenceRange" in patch) {
          if (!next.flag || next.autoFlagged) {
            const auto = flagForValue(next.value, next.referenceRange);
            next.flag = (auto ?? "") as FlagValue;
            next.autoFlagged = Boolean(auto);
          }
        }
        return next;
      });

      // Step 2: re-derive auto-formulas across this report's rows
      if (!("value" in patch)) {
        return { ...prev, [reportId]: step1 };
      }
      const report = reports.find((r) => r.id === reportId);
      const derived = deriveAutoValues(report?.testCode, step1);
      if (derived.size === 0) return { ...prev, [reportId]: step1 };

      const step2 = step1.map((r) => {
        const newValue = derived.get(r.parameter);
        if (newValue === undefined) return r;
        const canOverwrite = r.value === "" || Boolean(r.autoDerived);
        if (!canOverwrite || newValue === r.value) return r;
        const next: EditableRow = {
          ...r,
          value: newValue,
          autoDerived: true,
        };
        if (!next.flag || next.autoFlagged) {
          const auto = flagForValue(next.value, next.referenceRange);
          next.flag = (auto ?? "") as FlagValue;
          next.autoFlagged = Boolean(auto);
        }
        return next;
      });
      return { ...prev, [reportId]: step2 };
    });
  }

  function rowsToResult(rows: EditableRow[]): ResultRow[] {
    return rows.map((r) => ({
      id: r.id,
      parameter: r.parameter.trim(),
      value: r.value.trim(),
      unit: r.unit.trim() || undefined,
      referenceRange: r.referenceRange.trim() || undefined,
      flag: r.flag || undefined,
    }));
  }

  function saveAll() {
    let savedCount = 0;
    try {
      for (const r of editableReports) {
        const rows = rowsByReport[r.id];
        if (!rows) continue;
        updateReport(r.id, { results: rowsToResult(rows) });
        savedCount += 1;
      }
      toast.success(
        `Saved results across ${savedCount} report${savedCount === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  function saveAndSendAllForReview() {
    let saved = 0;
    let sent = 0;
    try {
      for (const r of editableReports) {
        const rows = rowsByReport[r.id];
        if (!rows) continue;
        const hasValues = rows.some((row) => row.value.trim() !== "");
        if (!hasValues) continue;
        updateReport(r.id, { results: rowsToResult(rows) });
        saved += 1;
        if (
          r.status === "Sample Collected" ||
          r.status === "Waiting for Results"
        ) {
          try {
            sendForReview(r.id);
            sent += 1;
          } catch {
            // Skip — typically means status doesn't allow the transition;
            // the user can sort that out from the individual report.
          }
        }
      }
      toast.success(
        `Saved ${saved} report${saved === 1 ? "" : "s"}` +
          (sent > 0 ? `; ${sent} sent for review` : ""),
      );
      router.push("/reports");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  const patientName = patient ? getPatientFullName(patient) : "Unknown patient";
  const firstReport = reports[0];
  const visitDate = formatDateOnly(
    firstReport?.collectedAt ?? firstReport?.createdAt,
  );

  return (
    <main className="mx-auto w-full max-w-400 px-6 py-8">
      <Link
        href="/reports"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to reports
      </Link>

      {/* Visit header */}
      <header className="mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="from-brand-50 to-background border-b border-neutral-100 bg-gradient-to-b p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <TestTube2 className="text-brand-700 h-5 w-5" />
                <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                  Visit · {reports.length} tests
                </h1>
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link
                  href={`/patients/${patientId}`}
                  className="text-foreground hover:text-brand-700 inline-flex items-center gap-1.5 font-medium"
                >
                  <User className="h-4 w-4" />
                  {patientName}
                  {patient?.patientCode && (
                    <span className="font-mono text-xs">
                      {patient.patientCode}
                    </span>
                  )}
                </Link>
                {firstReport?.requestingDoctor && (
                  <span className="flex items-center gap-1.5">
                    <Stethoscope className="h-4 w-4" />
                    {firstReport.requestingDoctor}
                  </span>
                )}
                {visitDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {visitDate}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveAll}
                disabled={editableReports.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save all
              </button>
              <button
                type="button"
                onClick={saveAndSendAllForReview}
                disabled={editableReports.length === 0}
                className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Save &amp; send all for review
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Per-test cards — collapsible. */}
      <div className="space-y-4">
        {reports.map((report) => {
          const rows = rowsByReport[report.id] ?? [];
          const isCollapsed = Boolean(collapsed[report.id]);
          const isLocked =
            report.status === "Published" || report.status === "Cancelled";
          const filled = rows.filter((r) => r.value.trim() !== "").length;
          return (
            <section
              key={report.id}
              className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [report.id]: !c[report.id] }))
                }
                className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3 text-left hover:bg-neutral-50/60"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-neutral-400 transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-neutral-900">
                        {report.testName}
                      </h2>
                      {report.testCode && (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {report.testCode}
                        </span>
                      )}
                      <StatusPill status={report.status} />
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {report.reportCode} · {filled} / {rows.length} filled
                    </div>
                  </div>
                </div>
                <Link
                  href={`/reports/${report.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-700 hover:text-brand-800 text-xs font-medium hover:underline"
                >
                  Open full report
                </Link>
              </button>

              {!isCollapsed && (
                <div className="space-y-3 p-5">
                  <ReportProgress status={report.status} />
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground text-sm italic">
                      No result rows on this report.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-neutral-200">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50/80">
                          <tr className="border-b border-neutral-200 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                            <th className="px-3 py-2 text-left">Parameter</th>
                            <th className="px-3 py-2 text-left">Value</th>
                            <th className="w-28 px-3 py-2 text-left">Unit</th>
                            <th className="w-40 px-3 py-2 text-left">
                              Range
                            </th>
                            <th className="w-28 px-3 py-2 text-left">Flag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => {
                            const flagTone = row.flag
                              ? FLAG_TONE[row.flag]
                              : null;
                            const isCritical = row.flag === "Critical";
                            return (
                              <tr
                                key={row.id}
                                className={cn(
                                  "border-b border-neutral-100 last:border-0",
                                  isCritical && "bg-red-50/40",
                                  row.flag === "High" && "bg-amber-50/30",
                                  row.flag === "Low" && "bg-sky-50/30",
                                )}
                              >
                                <td className="px-3 py-2 text-sm font-medium text-neutral-900">
                                  {row.parameter}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={row.value}
                                    onChange={(e) =>
                                      updateRow(report.id, idx, {
                                        value: e.target.value,
                                      })
                                    }
                                    disabled={isLocked}
                                    placeholder="—"
                                    className={cn(
                                      "focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 disabled:cursor-not-allowed",
                                      isCritical &&
                                        "font-semibold text-red-700",
                                    )}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={row.unit}
                                    onChange={(e) =>
                                      updateRow(report.id, idx, {
                                        unit: e.target.value,
                                      })
                                    }
                                    disabled={isLocked}
                                    placeholder="—"
                                    className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={row.referenceRange}
                                    onChange={(e) =>
                                      updateRow(report.id, idx, {
                                        referenceRange: e.target.value,
                                      })
                                    }
                                    disabled={isLocked}
                                    placeholder="—"
                                    className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={row.flag}
                                    onChange={(e) =>
                                      updateRow(report.id, idx, {
                                        flag: e.target.value as FlagValue,
                                      })
                                    }
                                    disabled={isLocked}
                                    className={cn(
                                      "rounded-md px-1.5 py-0.5 text-xs font-medium outline-none disabled:cursor-not-allowed",
                                      row.flag
                                        ? cn(flagTone?.bg, flagTone?.text)
                                        : "bg-transparent text-neutral-400",
                                    )}
                                  >
                                    <option value="">—</option>
                                    <option value="Low">Low</option>
                                    <option value="Normal">Normal</option>
                                    <option value="High">High</option>
                                    <option value="Critical">Critical</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
