"use client";

import {
  AlarmClock,
  FilePlus2,
  Layers,
  MoreHorizontal,
  Pencil,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-states";
import { PageHeader } from "@/components/common/page-header";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/common/status-badge";
import { Timestamp } from "@/components/common/timestamp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  getPatientFullName,
  usePatientsStore,
} from "@/lib/stores/patients";
import {
  ColumnFilter,
  ColumnHeader,
  PopoverField,
  PopoverSelect,
  type SortDirection,
} from "@/components/reports/column-filter";
import {
  STATUS_ICON,
  StatusPill,
} from "@/components/reports/status-pill";
import { TatChip } from "@/components/reports/tat-chip";
import { useTickingNow } from "@/hooks/use-ticking-now";
import { useAuthStore } from "@/lib/stores/auth";
import { useLabCatalogStore } from "@/lib/stores/lab-catalog";
import {
  REPORT_STATUSES,
  STATUS_VARIANT,
  WORKFLOW_STEPS,
  type ReportStatus,
  useReportsStore,
} from "@/lib/stores/reports";
import { cn, formatDateOnly } from "@/lib/utils";
import { getTatState } from "@/lib/utils/tat";

type Filter = "All" | "Overdue" | "Unpaid" | ReportStatus;

const STATUS_FILTERS: Filter[] = [
  "All",
  "Overdue",
  ...REPORT_STATUSES,
  "Unpaid",
];

export default function ReportsPage() {
  // useSearchParams() bails out of static prerendering, so it must live
  // inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsPageContent />
    </Suspense>
  );
}

function ReportsPageContent() {
  const reports = useReportsStore((s) => s.reports);
  const patients = usePatientsStore((s) => s.patients);
  const labTests = useLabCatalogStore((s) => s.tests);
  const role = useAuthStore((s) => s.currentUser.role);
  // Technicians see payment status (useful for handoff) but never the
  // rupee amount or method on the patient-facing list.
  const showMoney = role === "OWNER" || role === "ADMIN";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const now = useTickingNow(60_000);

  // Extra filters layered on top of the search + status row. Kept in local
  // state for simplicity — URL persistence can come later.
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "paid" | "unpaid"
  >("all");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<
    "all" | "Male" | "Female" | "Other"
  >("all");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [lastVisitFilter, setLastVisitFilter] = useState<
    "all" | "today" | "7d" | "30d"
  >("all");
  const [collectedFilter, setCollectedFilter] = useState<
    "all" | "today" | "7d" | "30d"
  >("all");

  function clearExtraFilters() {
    setPaymentFilter("all");
    setDoctorFilter("all");
    setGenderFilter("all");
    setAgeMin("");
    setAgeMax("");
    setLastVisitFilter("all");
    setCollectedFilter("all");
  }

  const extraFilterCount =
    (paymentFilter !== "all" ? 1 : 0) +
    (doctorFilter !== "all" ? 1 : 0) +
    (genderFilter !== "all" ? 1 : 0) +
    (ageMin || ageMax ? 1 : 0) +
    (lastVisitFilter !== "all" ? 1 : 0) +
    (collectedFilter !== "all" ? 1 : 0);

  // Single-column sort. Default: newest collected first — matches what
  // most receptionists expect when they open the reports queue.
  type SortColumn =
    | "report"
    | "patient"
    | "test"
    | "status"
    | "collected"
    | "doctor"
    | "payment";
  const [sortBy, setSortBy] = useState<{
    column: SortColumn;
    direction: SortDirection;
  }>({ column: "collected", direction: "desc" });

  function cycleSort(column: SortColumn) {
    setSortBy((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  }

  function sortDirFor(column: SortColumn): SortDirection | null {
    return sortBy.column === column ? sortBy.direction : null;
  }

  const labTestByCode = useMemo(() => {
    const m = new Map<string, (typeof labTests)[number]>();
    for (const t of labTests) m.set(t.code.toUpperCase(), t);
    return m;
  }, [labTests]);

  // URL is the source of truth for the filter — supports shareable links
  // and back-button navigation from the dashboard's pipeline cards.
  const statusParam = searchParams.get("status");
  const statusFilter: Filter =
    statusParam === "Overdue"
      ? "Overdue"
      : statusParam === "Unpaid"
        ? "Unpaid"
        : statusParam && (REPORT_STATUSES as string[]).includes(statusParam)
          ? (statusParam as ReportStatus)
          : "All";

  // Scope filters — typically arrived at via deep links from the patient
  // page ("show me all of Shiva's CBCs") or from anywhere else that wants
  // a pre-filtered slice of the reports list.
  const patientScope = searchParams.get("patient") ?? "";
  const testCodeScope = (searchParams.get("testCode") ?? "").toUpperCase();

  function setStatusFilter(next: Filter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "All") params.delete("status");
    else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearScopeParam(key: "patient" | "testCode") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const patientById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getPatientFullName>>();
    for (const p of patients) m.set(p.id, getPatientFullName(p));
    return m;
  }, [patients]);

  const patientRecordById = useMemo(() => {
    const m = new Map<string, (typeof patients)[number]>();
    for (const p of patients) m.set(p.id, p);
    return m;
  }, [patients]);

  // Unique requesting-doctor list, derived from reports. Sorted alphabetically.
  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      if (r.requestingDoctor) set.add(r.requestingDoctor);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  // Each patient's most-recent visit timestamp — used for the "Last visit"
  // filter, which compares against the lookup-walking customer's last visit.
  const lastVisitByPatient = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) {
      const at = r.statusHistory[0]?.at;
      if (!at) continue;
      const t = Date.parse(at);
      if (!Number.isFinite(t)) continue;
      const existing = m.get(r.patientId);
      if (existing === undefined || t > existing) m.set(r.patientId, t);
    }
    return m;
  }, [reports]);

  const visitSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) m.set(r.visitId, (m.get(r.visitId) ?? 0) + 1);
    return m;
  }, [reports]);

  // Pre-compute overdue status per report so both filter and count queries
  // share the same logic. A report is "overdue" when its TAT has elapsed
  // while it's still in an active workflow stage (Sample Collected or
  // Waiting for Results).
  const overdueIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of reports) {
      const labTest = r.testCode
        ? labTestByCode.get(r.testCode.toUpperCase())
        : undefined;
      if (getTatState(r, labTest, now).status === "overdue") s.add(r.id);
    }
    return s;
  }, [reports, labTestByCode, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ageMinNum = ageMin === "" ? null : Number(ageMin);
    const ageMaxNum = ageMax === "" ? null : Number(ageMax);
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeCutoff = (preset: "today" | "7d" | "30d"): number => {
      if (preset === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start.getTime();
      }
      if (preset === "7d") return now - 7 * dayMs;
      return now - 30 * dayMs;
    };

    return reports.filter((r) => {
      // Scope filters first — these come from deep links and should
      // short-circuit anything not matching the linked-to slice.
      if (patientScope && r.patientId !== patientScope) return false;
      if (
        testCodeScope &&
        (r.testCode ?? "").toUpperCase() !== testCodeScope
      ) {
        return false;
      }

      if (statusFilter === "Overdue") {
        if (!overdueIds.has(r.id)) return false;
      } else if (statusFilter === "Unpaid") {
        // "Needs payment" — published reports with no payment recorded
        // yet, OR with a refunded payment (the money came back to the
        // patient, so from the lab's books it's unpaid again).
        if (r.status !== "Published") return false;
        const isUnpaid =
          !r.payment || Boolean(r.payment.refundedAt);
        if (!isUnpaid) return false;
      } else if (statusFilter !== "All" && r.status !== statusFilter) {
        return false;
      }

      // Payment
      if (paymentFilter === "paid" && !r.payment) return false;
      if (paymentFilter === "unpaid" && r.payment) return false;

      // Doctor
      if (doctorFilter !== "all" && r.requestingDoctor !== doctorFilter) {
        return false;
      }

      // Patient-attribute filters
      const patient = patientRecordById.get(r.patientId);
      if (genderFilter !== "all" && patient?.gender !== genderFilter) {
        return false;
      }
      if (ageMinNum !== null && (patient?.age ?? -1) < ageMinNum) return false;
      if (ageMaxNum !== null && (patient?.age ?? Infinity) > ageMaxNum) {
        return false;
      }

      // Last visit (per-patient most-recent sample collection)
      if (lastVisitFilter !== "all") {
        const lv = lastVisitByPatient.get(r.patientId);
        if (lv === undefined) return false;
        if (lv < rangeCutoff(lastVisitFilter)) return false;
      }

      // Collected (per-report sample collection)
      if (collectedFilter !== "all") {
        const at = r.statusHistory[0]?.at;
        const t = at ? Date.parse(at) : NaN;
        if (!Number.isFinite(t)) return false;
        if (t < rangeCutoff(collectedFilter)) return false;
      }

      if (!q) return true;
      const patientName = patientById.get(r.patientId)?.toLowerCase() ?? "";
      return (
        r.reportCode.toLowerCase().includes(q) ||
        r.testName.toLowerCase().includes(q) ||
        (r.testCode?.toLowerCase().includes(q) ?? false) ||
        patientName.includes(q) ||
        (r.requestingDoctor?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    reports,
    query,
    statusFilter,
    patientById,
    patientRecordById,
    overdueIds,
    paymentFilter,
    doctorFilter,
    genderFilter,
    ageMin,
    ageMax,
    lastVisitFilter,
    collectedFilter,
    lastVisitByPatient,
    now,
    patientScope,
    testCodeScope,
  ]);

  const statusCounts = useMemo(() => {
    const m = new Map<Filter, number>();
    m.set("All", reports.length);
    m.set("Overdue", overdueIds.size);
    for (const s of REPORT_STATUSES) m.set(s, 0);
    let unpaid = 0;
    for (const r of reports) {
      m.set(r.status, (m.get(r.status) ?? 0) + 1);
      if (
        r.status === "Published" &&
        (!r.payment || r.payment.refundedAt)
      ) {
        unpaid += 1;
      }
    }
    m.set("Unpaid", unpaid);
    return m;
  }, [reports, overdueIds]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortBy.direction === "asc" ? 1 : -1;
    const collectedAt = (r: (typeof reports)[number]): number => {
      const at = r.statusHistory[0]?.at;
      const t = at ? Date.parse(at) : NaN;
      return Number.isFinite(t) ? t : 0;
    };
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy.column) {
        case "report":
          cmp = a.reportCode.localeCompare(b.reportCode);
          break;
        case "patient":
          cmp = (patientById.get(a.patientId) ?? "").localeCompare(
            patientById.get(b.patientId) ?? "",
          );
          break;
        case "test":
          cmp = a.testName.localeCompare(b.testName);
          break;
        case "status":
          cmp =
            WORKFLOW_STEPS.indexOf(a.status) -
            WORKFLOW_STEPS.indexOf(b.status);
          break;
        case "collected":
          cmp = collectedAt(a) - collectedAt(b);
          break;
        case "doctor":
          cmp = (a.requestingDoctor ?? "").localeCompare(
            b.requestingDoctor ?? "",
          );
          break;
        case "payment":
          cmp = (a.payment?.amount ?? 0) - (b.payment?.amount ?? 0);
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortBy, patientById]);

  return (
    <div className="mx-auto max-w-400">
      <PageHeader
        title="Reports"
        description={`${reports.length} total lab reports across all statuses.`}
        actions={
          <Link
            href="/reports/new"
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <FilePlus2 className="h-4 w-4" />
            New report
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by report code, patient, test, or doctor..."
            className="focus-visible:ring-brand-500/30 h-10 rounded-lg border-neutral-200 bg-white pl-9 shadow-sm"
          />
        </div>
      </div>

      {(patientScope || testCodeScope) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
          <span className="text-brand-900 font-medium">Scope:</span>
          {patientScope && (
            <ScopeChip
              label={
                patientById.get(patientScope) ??
                `Patient ${patientScope.slice(0, 6)}`
              }
              onClear={() => clearScopeParam("patient")}
            />
          )}
          {testCodeScope && (
            <ScopeChip
              label={
                labTestByCode.get(testCodeScope)?.name ?? testCodeScope
              }
              hint={testCodeScope}
              onClear={() => clearScopeParam("testCode")}
            />
          )}
        </div>
      )}

      {extraFilterCount > 0 && (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={clearExtraFilters}
            className="text-brand-700 hover:text-brand-800 text-xs font-medium underline-offset-2 hover:underline"
          >
            Clear column filters ({extraFilterCount})
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const isActive = s === statusFilter;
          const count = statusCounts.get(s) ?? 0;
          return (
            <FilterChip
              key={s}
              filter={s}
              count={count}
              isActive={isActive}
              onClick={() => setStatusFilter(s)}
            />
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <Table className="min-w-225">
          <TableHeader className="bg-neutral-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-36">
                <ColumnHeader
                  label="Report"
                  sortDirection={sortDirFor("report")}
                  onSortClick={() => cycleSort("report")}
                />
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Patient"
                  sortDirection={sortDirFor("patient")}
                  onSortClick={() => cycleSort("patient")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter patients"
                      isActive={
                        genderFilter !== "all" ||
                        ageMin !== "" ||
                        ageMax !== "" ||
                        lastVisitFilter !== "all"
                      }
                      onClear={() => {
                        setGenderFilter("all");
                        setAgeMin("");
                        setAgeMax("");
                        setLastVisitFilter("all");
                      }}
                    >
                      <PopoverField label="Gender">
                        <PopoverSelect
                          value={genderFilter}
                          onChange={(v) =>
                            setGenderFilter(
                              v as "all" | "Male" | "Female" | "Other",
                            )
                          }
                          options={[
                            { value: "all", label: "Any" },
                            { value: "Male", label: "Male" },
                            { value: "Female", label: "Female" },
                            { value: "Other", label: "Other" },
                          ]}
                        />
                      </PopoverField>
                      <PopoverField label="Age range">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={150}
                            value={ageMin}
                            onChange={(e) => setAgeMin(e.target.value)}
                            placeholder="Min"
                            className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2"
                          />
                          <span aria-hidden className="text-neutral-400">
                            –
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={150}
                            value={ageMax}
                            onChange={(e) => setAgeMax(e.target.value)}
                            placeholder="Max"
                            className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2"
                          />
                        </div>
                      </PopoverField>
                      <PopoverField label="Last visit">
                        <PopoverSelect
                          value={lastVisitFilter}
                          onChange={(v) =>
                            setLastVisitFilter(
                              v as "all" | "today" | "7d" | "30d",
                            )
                          }
                          options={[
                            { value: "all", label: "Any time" },
                            { value: "today", label: "Today" },
                            { value: "7d", label: "Last 7 days" },
                            { value: "30d", label: "Last 30 days" },
                          ]}
                        />
                      </PopoverField>
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Test"
                  sortDirection={sortDirFor("test")}
                  onSortClick={() => cycleSort("test")}
                />
              </TableHead>
              <TableHead className="w-48">
                <ColumnHeader
                  label="Status"
                  sortDirection={sortDirFor("status")}
                  onSortClick={() => cycleSort("status")}
                />
              </TableHead>
              <TableHead className="w-32">
                <ColumnHeader
                  label="Collected"
                  sortDirection={sortDirFor("collected")}
                  onSortClick={() => cycleSort("collected")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter collected dates"
                      isActive={collectedFilter !== "all"}
                      onClear={() => setCollectedFilter("all")}
                    >
                      <PopoverField label="Collected when">
                        <PopoverSelect
                          value={collectedFilter}
                          onChange={(v) =>
                            setCollectedFilter(
                              v as "all" | "today" | "7d" | "30d",
                            )
                          }
                          options={[
                            { value: "all", label: "Any time" },
                            { value: "today", label: "Today" },
                            { value: "7d", label: "Last 7 days" },
                            { value: "30d", label: "Last 30 days" },
                          ]}
                        />
                      </PopoverField>
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead className="w-32">
                <ColumnHeader
                  label="Doctor"
                  sortDirection={sortDirFor("doctor")}
                  onSortClick={() => cycleSort("doctor")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by doctor"
                      isActive={doctorFilter !== "all"}
                      onClear={() => setDoctorFilter("all")}
                    >
                      <PopoverField label="Prescribing doctor">
                        <PopoverSelect
                          value={doctorFilter}
                          onChange={setDoctorFilter}
                          options={[
                            { value: "all", label: "Any" },
                            ...doctorOptions.map((d) => ({
                              value: d,
                              label: d,
                            })),
                          ]}
                        />
                      </PopoverField>
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead className="w-36">
                <ColumnHeader
                  label="Payment"
                  align="end"
                  sortDirection={sortDirFor("payment")}
                  onSortClick={() => cycleSort("payment")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by payment status"
                      isActive={paymentFilter !== "all"}
                      onClear={() => setPaymentFilter("all")}
                      align="end"
                    >
                      <PopoverField label="Payment status">
                        <PopoverSelect
                          value={paymentFilter}
                          onChange={(v) =>
                            setPaymentFilter(
                              v as "all" | "paid" | "unpaid",
                            )
                          }
                          options={[
                            { value: "all", label: "Any" },
                            { value: "paid", label: "Paid" },
                            { value: "unpaid", label: "Unpaid" },
                          ]}
                        />
                      </PopoverField>
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-0">
                  <EmptyState
                    icon={Search}
                    title={
                      query || statusFilter !== "All"
                        ? "No reports match your filters"
                        : "No reports yet"
                    }
                    description={
                      query || statusFilter !== "All"
                        ? "Try clearing the search or status filter to see more."
                        : "Create the first report for a patient to get started."
                    }
                    action={
                      query || statusFilter !== "All" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setStatusFilter("All");
                          }}
                          className="text-brand-700 hover:text-brand-800 text-sm font-medium underline-offset-2 hover:underline"
                        >
                          Clear filters
                        </button>
                      ) : (
                        <Link
                          href="/reports/new"
                          className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-sm transition-colors"
                        >
                          <FilePlus2 className="h-4 w-4" />
                          New report
                        </Link>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const patientName =
                  patientById.get(r.patientId) ?? "Unknown patient";
                const labTest = r.testCode
                  ? labTestByCode.get(r.testCode.toUpperCase())
                  : undefined;
                const tatState = getTatState(r, labTest, now);
                const visitCount = visitSize.get(r.visitId) ?? 1;
                return (
                  <TableRow
                    key={r.id}
                    className="hover:bg-brand-50/40 border-b border-neutral-100 transition-colors last:border-0"
                  >
                    <TableCell className="align-top">
                      <Link
                        href={`/reports/${r.id}`}
                        className="hover:text-brand-700 font-mono text-sm font-medium text-neutral-900 transition-colors"
                      >
                        {r.reportCode}
                      </Link>
                      {visitCount > 1 && (
                        <Link
                          href={`/patients/${r.patientId}`}
                          title={`Part of a ${visitCount}-test visit`}
                          className="text-muted-foreground hover:text-brand-700 mt-0.5 flex items-center gap-1 text-[11px]"
                        >
                          <Layers className="h-3 w-3" />
                          {visitCount}-test visit
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="hover:text-brand-700 text-sm font-medium text-neutral-900 transition-colors"
                      >
                        {patientName}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="text-sm font-medium text-neutral-900">
                        {r.testName}
                      </div>
                      {r.testCode && (
                        <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                          {r.testCode}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusPill status={r.status} />
                        {tatState.status !== "not-applicable" && (
                          <TatChip state={tatState} compact />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Timestamp at={r.statusHistory[0]?.at} />
                    </TableCell>
                    <TableCell className="align-top text-sm text-neutral-700">
                      {r.requestingDoctor ?? "—"}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      {r.payment && !r.payment.refundedAt ? (
                        showMoney ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="text-sm font-medium text-neutral-900 tabular-nums">
                              ₹{r.payment.amount.toLocaleString("en-IN")}
                            </span>
                            <span className="text-muted-foreground mt-0.5 text-[11px]">
                              {r.payment.method}
                            </span>
                          </div>
                        ) : (
                          <StatusBadge variant="success" size="sm">
                            Paid
                          </StatusBadge>
                        )
                      ) : (
                        <UnpaidCell
                          report={r}
                          now={now}
                          wasRefunded={Boolean(r.payment?.refundedAt)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Report actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            render={<Link href={`/reports/${r.id}`} />}
                          >
                            View report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            render={<Link href={`/reports/${r.id}/edit`} />}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            render={<Link href={`/patients/${r.patientId}`} />}
                          >
                            View patient
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Filter chip palette — one entry per semantic variant. `idle` is the base
// look; `active` is what we use when this chip is the currently selected
// filter. The `idle` background is intentionally the same as the in-row
// `StatusBadge` so the filter row and the table speak the same colour
// language.
const FILTER_CHIP_TONE: Record<
  StatusBadgeVariant,
  { idle: string; active: string }
> = {
  neutral: {
    idle: "bg-neutral-100 text-neutral-600 ring-neutral-200 hover:bg-neutral-200",
    active: "bg-neutral-200 text-neutral-800 ring-neutral-300",
  },
  info: {
    idle: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100",
    active: "bg-sky-100 text-sky-800 ring-sky-300",
  },
  success: {
    idle: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
    active: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  },
  warning: {
    idle: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
    active: "bg-amber-100 text-amber-900 ring-amber-300",
  },
  danger: {
    idle: "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100",
    active: "bg-red-100 text-red-800 ring-red-300",
  },
  accent: {
    idle: "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100",
    active: "bg-violet-100 text-violet-800 ring-violet-300",
  },
  brand: {
    idle: "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100",
    active: "bg-brand-100 text-brand-800 ring-brand-300",
  },
};

interface FilterChipProps {
  filter: Filter;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function FilterChip({ filter, count, isActive, onClick }: FilterChipProps) {
  // Pick a variant + icon based on the filter. "All" is a neutral catch-all,
  // "Overdue" is a synthetic filter (not a status), and everything else
  // borrows the variant + icon from the per-row StatusPill.
  let variant: StatusBadgeVariant;
  let Icon: LucideIcon | null = null;
  if (filter === "All") {
    variant = "neutral";
  } else if (filter === "Overdue") {
    variant = "danger";
    Icon = AlarmClock;
  } else if (filter === "Unpaid") {
    // Distinct visual to separate "needs payment" from clinical-status
    // filters — uses the brand colour like a soft call-to-action chip.
    variant = "warning";
    Icon = Wallet;
  } else {
    variant = STATUS_VARIANT[filter];
    Icon = STATUS_ICON[filter];
  }

  const tone = FILTER_CHIP_TONE[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-colors",
        isActive ? tone.active : tone.idle,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {filter}
      <span
        className={cn(
          "ml-1 text-[11px] tabular-nums",
          isActive ? "font-semibold" : "opacity-70",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Payment-column cell for an Unpaid report. Shows the "Unpaid" badge
 * plus an aging label (e.g. "12d") computed from publishedAt so the
 * receptionist can prioritise the oldest unpaid first when chasing
 * payment. For not-yet-published reports we just show "Unpaid" — the
 * aging clock starts at publish.
 */
function UnpaidCell({
  report,
  now,
  wasRefunded = false,
}: {
  report: { status: ReportStatus; publishedAt?: string };
  now: number;
  wasRefunded?: boolean;
}) {
  const ageDays =
    report.status === "Published" && report.publishedAt
      ? Math.max(
          0,
          Math.floor(
            (now - Date.parse(report.publishedAt)) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  const tone: StatusBadgeVariant = wasRefunded
    ? "danger"
    : ageDays == null
      ? "warning"
      : ageDays >= 30
        ? "danger"
        : "warning";

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <StatusBadge variant={tone} size="sm">
        {wasRefunded ? "Refunded" : "Unpaid"}
      </StatusBadge>
      {ageDays != null && ageDays > 0 && (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            ageDays >= 30
              ? "text-red-600 font-medium"
              : ageDays >= 7
                ? "text-amber-700"
                : "text-muted-foreground",
          )}
          title={`Published ${ageDays} day${ageDays === 1 ? "" : "s"} ago`}
        >
          {ageDays}d old
        </span>
      )}
    </div>
  );
}

function ScopeChip({
  label,
  hint,
  onClear,
}: {
  label: string;
  hint?: string;
  onClear: () => void;
}) {
  return (
    <span className="ring-brand-300 text-brand-900 inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-medium ring-1 ring-inset">
      <span>{label}</span>
      {hint && (
        <span className="text-brand-600 font-mono text-[10px]">{hint}</span>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="text-brand-700 hover:bg-brand-100 hover:text-brand-900 -mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

