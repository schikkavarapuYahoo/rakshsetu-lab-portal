"use client";

import {
  ArrowLeft,
  Activity as ActivityIcon,
  Calendar,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone as PhoneIcon,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo } from "react";

import { StatusPill } from "@/components/reports/status-pill";
import { getPatientFullName, usePatientsStore } from "@/lib/stores/patients";
import {
  useReportsStore,
  type Report,
} from "@/lib/stores/reports";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-states";
import { Timestamp } from "@/components/common/timestamp";
import { cn, formatDateOnly, formatPhone } from "@/lib/utils";

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * BMI category per WHO. Tone matches the dashboard chip colours so the
 * receptionist reads "amber = monitor, red = clinically significant" the
 * same way everywhere.
 */
function bmiCategory(bmi: number): { label: string; tone: string } {
  if (bmi < 18.5)
    return { label: "Underweight", tone: "text-sky-700 bg-sky-50 ring-sky-200" };
  if (bmi < 25)
    return {
      label: "Normal",
      tone: "text-emerald-700 bg-emerald-50 ring-emerald-200",
    };
  if (bmi < 30)
    return {
      label: "Overweight",
      tone: "text-amber-800 bg-amber-50 ring-amber-200",
    };
  return { label: "Obese", tone: "text-red-700 bg-red-50 ring-red-200" };
}

function VitalsLine({
  heightCm,
  weightKg,
}: {
  heightCm: number | undefined;
  weightKg: number | undefined;
}) {
  if (heightCm === undefined && weightKg === undefined) {
    return (
      <span className="text-muted-foreground text-sm">
        Not recorded yet
      </span>
    );
  }
  const parts: string[] = [];
  if (typeof heightCm === "number") parts.push(`${heightCm} cm`);
  if (typeof weightKg === "number") parts.push(`${weightKg} kg`);
  const bmi =
    typeof heightCm === "number" && typeof weightKg === "number" && heightCm > 0
      ? weightKg / (heightCm / 100) ** 2
      : null;
  const cat = bmi !== null ? bmiCategory(bmi) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-medium text-neutral-900 tabular-nums">
        {parts.join(" · ")}
      </span>
      {bmi !== null && cat && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cat.tone}`}
          title="Body Mass Index"
        >
          <span className="tabular-nums">BMI {bmi.toFixed(1)}</span>
          <span aria-hidden>·</span>
          <span>{cat.label}</span>
        </span>
      )}
    </div>
  );
}

interface VisitGroup {
  visitId: string;
  collectedAt: string | undefined;
  reports: Report[];
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const patient = usePatientsStore((s) => s.patients.find((p) => p.id === id));
  const allReports = useReportsStore((s) => s.reports);
  const patientReports = useMemo(
    () => allReports.filter((r) => r.patientId === id),
    [allReports, id],
  );
  const reportCount = patientReports.length;
  const hasHydrated =
    (usePatientsStore.persist?.hasHydrated() ?? true) &&
    (useReportsStore.persist?.hasHydrated() ?? true);

  // Most recent moment we took a sample from this patient, derived from
  // the first status-history entry across their reports. Falls back to the
  // (date-only) `lastVisit` field when the patient has no reports yet.
  const lastVisitAt = useMemo<string | undefined>(() => {
    let latest: string | undefined;
    for (const r of patientReports) {
      const at = r.statusHistory[0]?.at;
      if (!at) continue;
      if (!latest || at > latest) latest = at;
    }
    return latest;
  }, [patientReports]);

  // Test-type breakdown across all visits — "Shiva has had CBC ×5, Lipid ×3"
  // — so the technician sees clinical history at a glance before ordering
  // the next round. Keyed on name + code so a manually-named "CBC" and a
  // master-derived "CBC" with the same display still roll up together.
  //
  // Cancelled reports are excluded: a cancellation means the test was
  // abandoned before completion (wrong order, patient declined, sample
  // discarded), so clinically the test never happened. In-flight reports
  // stay — those samples are real and being processed.
  const clinicalReports = useMemo(
    () => patientReports.filter((r) => r.status !== "Cancelled"),
    [patientReports],
  );
  const clinicalVisitCount = useMemo(
    () => new Set(clinicalReports.map((r) => r.visitId)).size,
    [clinicalReports],
  );
  const testTypeCounts = useMemo(() => {
    const counts = new Map<
      string,
      { testName: string; testCode?: string; count: number }
    >();
    for (const r of clinicalReports) {
      const key = `${r.testName}|${r.testCode ?? ""}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else
        counts.set(key, {
          testName: r.testName,
          testCode: r.testCode,
          count: 1,
        });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [clinicalReports]);

  const visits = useMemo<VisitGroup[]>(() => {
    const groups = new Map<string, Report[]>();
    for (const r of patientReports) {
      const list = groups.get(r.visitId);
      if (list) list.push(r);
      else groups.set(r.visitId, [r]);
    }
    return Array.from(groups.entries())
      .map(([visitId, reports]) => {
        const sortedReports = [...reports].sort((a, b) =>
          a.reportCode.localeCompare(b.reportCode),
        );
        const collectedAt = sortedReports.find((r) => r.collectedAt)
          ?.collectedAt;
        return { visitId, collectedAt, reports: sortedReports };
      })
      .sort((a, b) => {
        // Most recent visits first; visits without a collection date fall
        // back to comparing report codes.
        if (a.collectedAt && b.collectedAt) {
          return b.collectedAt.localeCompare(a.collectedAt);
        }
        if (a.collectedAt) return -1;
        if (b.collectedAt) return 1;
        return b.reports[0]!.reportCode.localeCompare(
          a.reports[0]!.reportCode,
        );
      });
  }, [patientReports]);

  // Receptionist priority order: anything still in the workflow (Sample
  // Collected / Waiting / Review) needs attention right now. Published and
  // Cancelled visits are reference material — they go below in a History
  // section that's collapsed by default if it gets long.
  const { activeVisits, historyVisits } = useMemo(() => {
    const active: VisitGroup[] = [];
    const history: VisitGroup[] = [];
    for (const v of visits) {
      const isActive = v.reports.some(
        (r) => r.status !== "Published" && r.status !== "Cancelled",
      );
      if (isActive) active.push(v);
      else history.push(v);
    }
    return { activeVisits: active, historyVisits: history };
  }, [visits]);

  if (!hasHydrated) return <PageSkeleton maxWidth="max-w-5xl" />;

  if (!patient) notFound();

  const fullName = getPatientFullName(patient);
  const initials =
    `${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}`.toUpperCase();
  const updatedDifferentFromCreated =
    patient.updatedAt !== patient.createdAt ||
    patient.updatedBy.userId !== patient.createdBy.userId;

  return (
    <div className="mx-auto max-w-400">
      <div className="mb-6">
        <Link
          href="/patients"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patients
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="from-brand-50 to-background relative flex items-start justify-between gap-4 border-b border-neutral-100 bg-gradient-to-b p-6">
          <div className="flex items-start gap-4">
            <div className="from-brand-500 to-brand-700 ring-brand-200/60 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-semibold text-white shadow-sm ring-4">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                  {fullName}
                </h1>
                <span className="bg-brand-50 text-brand-700 ring-brand-100 inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-inset">
                  {patient.patientCode}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span>{patient.gender}</span>
                <span aria-hidden>·</span>
                <span>{patient.age} years</span>
                {patient.dateOfBirth && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Born {formatDateOnly(patient.dateOfBirth)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/patients/${patient.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <Link
              href={`/reports/new?patient=${patient.id}`}
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-sm transition-colors"
            >
              <FileText className="h-4 w-4" />
              New report
            </Link>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
              Contact
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <PhoneIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Phone</dt>
                  <dd className="font-mono">{formatPhone(patient.phone)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Email</dt>
                  <dd>{patient.email || "—"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Address</dt>
                  <dd className="whitespace-pre-line">
                    {patient.address || "—"}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
              Activity
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Calendar className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Last visit</dt>
                  <dd>
                    {lastVisitAt ? (
                      <Timestamp at={lastVisitAt} />
                    ) : (
                      <span className="text-sm text-neutral-700">
                        {formatDateOnly(patient.lastVisit)}
                      </span>
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <FileText className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Reports</dt>
                  <dd>
                    <span
                      className={
                        reportCount > 0
                          ? "bg-brand-50 text-brand-700 ring-brand-100 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-medium ring-1"
                          : "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-100 px-2 text-xs font-medium text-neutral-500"
                      }
                    >
                      {reportCount}
                    </span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ActivityIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Vitals</dt>
                  <dd>
                    <VitalsLine
                      heightCm={patient.heightCm}
                      weightKg={patient.weightKg}
                    />
                  </dd>
                </div>
              </div>
            </dl>
          </section>
        </div>

        {visits.length === 0 ? (
          <section className="border-t border-neutral-100 px-6 py-5">
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/40">
              <EmptyState
                variant="inline"
                icon={FileText}
                title="No reports yet"
                description="Create the first report for this patient when their sample arrives."
                action={
                  <Link
                    href={`/reports/new?patient=${patient.id}`}
                    className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-sm transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    New report
                  </Link>
                }
              />
            </div>
          </section>
        ) : (
          <>
            <TestsOverview
              patientId={patient.id}
              totalReports={clinicalReports.length}
              totalVisits={clinicalVisitCount}
              testTypeCounts={testTypeCounts}
            />
            <VisitList
              title="Active"
              meta={
                activeVisits.length === 0
                  ? "Nothing in flight"
                  : `${activeVisits.length} visit${activeVisits.length === 1 ? "" : "s"} in progress`
              }
              visits={activeVisits}
              emptyHint="No active reports for this patient — all caught up."
              isHistory={false}
            />
            {historyVisits.length > 0 && (
              <VisitList
                title="History"
                meta={`${historyVisits.length} past visit${historyVisits.length === 1 ? "" : "s"}`}
                visits={historyVisits}
                isHistory
              />
            )}
          </>
        )}

        <div className="border-t bg-neutral-50/60 px-6 py-4 text-xs text-neutral-600">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <User className="h-3.5 w-3.5 text-neutral-400" />
            <span>
              Registered by{" "}
              <span className="font-medium text-neutral-800">
                {patient.createdBy.userName}
              </span>{" "}
              on{" "}
              <span className="text-neutral-800">
                {formatStamp(patient.createdAt)}
              </span>
            </span>
            {updatedDifferentFromCreated && (
              <>
                <span aria-hidden>·</span>
                <span>
                  Last updated by{" "}
                  <span className="font-medium text-neutral-800">
                    {patient.updatedBy.userName}
                  </span>{" "}
                  on{" "}
                  <span className="text-neutral-800">
                    {formatStamp(patient.updatedAt)}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TestsOverviewProps {
  patientId: string;
  totalReports: number;
  totalVisits: number;
  testTypeCounts: { testName: string; testCode?: string; count: number }[];
}

function TestsOverview({
  patientId,
  totalReports,
  totalVisits,
  testTypeCounts,
}: TestsOverviewProps) {
  const TOP_N = 8;
  const top = testTypeCounts.slice(0, TOP_N);
  const moreCount = testTypeCounts.length - top.length;

  return (
    <section className="border-t border-neutral-100 px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
          Tests overview
        </h2>
        <span className="text-xs text-neutral-500">Across all visits</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex shrink-0 divide-x divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/40">
          <StatCell label="Tests" value={totalReports} />
          <StatCell label="Visits" value={totalVisits} />
          <StatCell label="Types" value={testTypeCounts.length} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {top.map((t) => {
            const params = new URLSearchParams({ patient: patientId });
            if (t.testCode) params.set("testCode", t.testCode);
            // Without a testCode we can't filter the reports list precisely,
            // so fall back to the patient-scoped view and let the user
            // narrow further with the search box.
            return (
              <Link
                key={`${t.testName}|${t.testCode ?? ""}`}
                href={`/reports?${params.toString()}`}
                title={
                  t.testCode
                    ? `View ${t.count} ${t.testName} report${t.count === 1 ? "" : "s"} for this patient`
                    : `View this patient's reports (no test code on file)`
                }
                className="bg-brand-50 text-brand-700 ring-brand-100 hover:bg-brand-100 hover:ring-brand-200 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors"
              >
                <span className="max-w-56 truncate">{t.testName}</span>
                <span className="ring-brand-200 text-brand-700 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 px-1.5 font-mono text-[10px] ring-1 ring-inset">
                  ×{t.count}
                </span>
              </Link>
            );
          })}
          {moreCount > 0 && (
            <Link
              href={`/reports?patient=${patientId}`}
              className="text-brand-700 hover:text-brand-900 text-xs font-medium underline-offset-2 hover:underline"
            >
              and {moreCount} more
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-18 flex-col items-center px-4 py-2.5">
      <span className="text-lg font-semibold tabular-nums text-neutral-900">
        {value}
      </span>
      <span className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
        {label}
      </span>
    </div>
  );
}

interface VisitListProps {
  title: string;
  meta?: string;
  visits: VisitGroup[];
  emptyHint?: string;
  /** Render with muted tone — used for the History section. */
  isHistory?: boolean;
}

function VisitList({
  title,
  meta,
  visits,
  emptyHint,
  isHistory = false,
}: VisitListProps) {
  return (
    <section className="border-t border-neutral-100 px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2
          className={cn(
            "text-sm font-semibold tracking-tight",
            isHistory ? "text-neutral-600" : "text-neutral-900",
          )}
        >
          {title}
        </h2>
        {meta && <span className="text-xs text-neutral-500">{meta}</span>}
      </div>

      {visits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/40 px-4 py-6 text-center text-sm text-neutral-500">
          {emptyHint ?? "Nothing to show."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visits.map((v) => (
            <li
              key={v.visitId}
              className={cn(
                "overflow-hidden rounded-lg border",
                isHistory ? "border-neutral-150 bg-neutral-50/30" : "border-neutral-200",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50/60 px-3.5 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="font-medium text-neutral-900">
                    {formatDateOnly(v.collectedAt) || "Undated visit"}
                  </span>
                  <span className="text-neutral-400">·</span>
                  <span className="text-xs text-neutral-600">
                    {v.reports.length} test
                    {v.reports.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <ul className="divide-y divide-neutral-100">
                {v.reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/reports/${r.id}`}
                      className="hover:bg-brand-50/40 flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-medium text-neutral-900">
                            {r.reportCode}
                          </span>
                          <span className="text-sm text-neutral-700">
                            {r.testName}
                          </span>
                          {r.testCode && (
                            <span className="font-mono text-[10px] text-neutral-400">
                              {r.testCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusPill status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
