"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, MoreHorizontal, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/common/empty-state";
import { Timestamp } from "@/components/common/timestamp";
import {
  ColumnFilter,
  ColumnHeader,
  PopoverField,
  PopoverSelect,
  type SortDirection,
} from "@/components/reports/column-filter";
import { getPatientFullName, usePatientsStore } from "@/lib/stores/patients";
import { useReportsStore } from "@/lib/stores/reports";
import { cn, formatPhone } from "@/lib/utils";

type SortColumn =
  | "patientCode"
  | "name"
  | "gender"
  | "age"
  | "lastVisit"
  | "reports";

export default function PatientsPage() {
  const [query, setQuery] = useState("");
  const patients = usePatientsStore((s) => s.patients);
  const reports = useReportsStore((s) => s.reports);

  // Column-level filters
  const [genderFilter, setGenderFilter] = useState<
    "all" | "Male" | "Female" | "Other"
  >("all");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [lastVisitFilter, setLastVisitFilter] = useState<
    "all" | "today" | "7d" | "30d"
  >("all");
  const [reportsFilter, setReportsFilter] = useState<
    "all" | "with" | "without"
  >("all");

  // Default sort: most recent visit first, like a triage queue.
  const [sortBy, setSortBy] = useState<{
    column: SortColumn;
    direction: SortDirection;
  }>({ column: "lastVisit", direction: "desc" });

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

  const reportCountByPatient = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) m.set(r.patientId, (m.get(r.patientId) ?? 0) + 1);
    return m;
  }, [reports]);

  // "Last visit" is the most recent moment a sample was actually taken for
  // this patient — derived from the first entry in each report's status
  // history. Falls back to the seeded `lastVisit` date-only field when the
  // patient has no reports yet.
  const lastVisitByPatient = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reports) {
      const at = r.statusHistory[0]?.at;
      if (!at) continue;
      const existing = m.get(r.patientId);
      if (!existing || at > existing) m.set(r.patientId, at);
    }
    return m;
  }, [reports]);

  const lastVisitTimestamp = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of patients) {
      const iso = lastVisitByPatient.get(p.id) ?? p.lastVisit;
      const t = iso ? Date.parse(iso) : NaN;
      if (Number.isFinite(t)) m.set(p.id, t);
    }
    return m;
  }, [patients, lastVisitByPatient]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ageMinNum = ageMin === "" ? null : Number(ageMin);
    const ageMaxNum = ageMax === "" ? null : Number(ageMax);
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeCutoff = (preset: "today" | "7d" | "30d"): number => {
      const now = Date.now();
      if (preset === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start.getTime();
      }
      if (preset === "7d") return now - 7 * dayMs;
      return now - 30 * dayMs;
    };

    return patients.filter((p) => {
      // Search
      if (q) {
        const name = getPatientFullName(p).toLowerCase();
        const matches =
          name.includes(q) ||
          p.patientCode.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q);
        if (!matches) return false;
      }
      // Gender
      if (genderFilter !== "all" && p.gender !== genderFilter) return false;
      // Age
      if (ageMinNum !== null && p.age < ageMinNum) return false;
      if (ageMaxNum !== null && p.age > ageMaxNum) return false;
      // Last visit
      if (lastVisitFilter !== "all") {
        const lv = lastVisitTimestamp.get(p.id);
        if (lv === undefined) return false;
        if (lv < rangeCutoff(lastVisitFilter)) return false;
      }
      // Reports presence
      const count = reportCountByPatient.get(p.id) ?? 0;
      if (reportsFilter === "with" && count === 0) return false;
      if (reportsFilter === "without" && count > 0) return false;

      return true;
    });
  }, [
    patients,
    query,
    genderFilter,
    ageMin,
    ageMax,
    lastVisitFilter,
    reportsFilter,
    lastVisitTimestamp,
    reportCountByPatient,
  ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortBy.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy.column) {
        case "patientCode":
          cmp = a.patientCode.localeCompare(b.patientCode);
          break;
        case "name":
          cmp = getPatientFullName(a).localeCompare(getPatientFullName(b));
          break;
        case "gender":
          cmp = a.gender.localeCompare(b.gender);
          break;
        case "age":
          cmp = a.age - b.age;
          break;
        case "lastVisit":
          cmp =
            (lastVisitTimestamp.get(a.id) ?? 0) -
            (lastVisitTimestamp.get(b.id) ?? 0);
          break;
        case "reports":
          cmp =
            (reportCountByPatient.get(a.id) ?? 0) -
            (reportCountByPatient.get(b.id) ?? 0);
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortBy, lastVisitTimestamp, reportCountByPatient]);

  const extraFilterCount =
    (genderFilter !== "all" ? 1 : 0) +
    (ageMin !== "" || ageMax !== "" ? 1 : 0) +
    (lastVisitFilter !== "all" ? 1 : 0) +
    (reportsFilter !== "all" ? 1 : 0);

  function clearColumnFilters() {
    setGenderFilter("all");
    setAgeMin("");
    setAgeMax("");
    setLastVisitFilter("all");
    setReportsFilter("all");
  }

  return (
    <div className="mx-auto max-w-400">
      {/* Page header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Patients
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {patients.length} total patient records
          </p>
        </div>
        <Link
          href="/patients/new"
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <UserPlus className="h-4 w-4" />
          Register Patient
        </Link>
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, patient ID, or phone..."
            className="focus-visible:ring-brand-500/30 h-10 rounded-lg border-neutral-200 bg-white pl-9 shadow-sm"
          />
        </div>
      </div>

      {extraFilterCount > 0 && (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={clearColumnFilters}
            className="text-brand-700 hover:text-brand-800 text-xs font-medium underline-offset-2 hover:underline"
          >
            Clear column filters ({extraFilterCount})
          </button>
        </div>
      )}

      {/* Table card */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-neutral-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[110px]">
                <ColumnHeader
                  label="Patient ID"
                  sortDirection={sortDirFor("patientCode")}
                  onSortClick={() => cycleSort("patientCode")}
                />
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Name"
                  sortDirection={sortDirFor("name")}
                  onSortClick={() => cycleSort("name")}
                />
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Gender"
                  sortDirection={sortDirFor("gender")}
                  onSortClick={() => cycleSort("gender")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by gender"
                      isActive={genderFilter !== "all"}
                      onClear={() => setGenderFilter("all")}
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
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Age"
                  sortDirection={sortDirFor("age")}
                  onSortClick={() => cycleSort("age")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by age range"
                      isActive={ageMin !== "" || ageMax !== ""}
                      onClear={() => {
                        setAgeMin("");
                        setAgeMax("");
                      }}
                    >
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
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Phone
              </TableHead>
              <TableHead>
                <ColumnHeader
                  label="Last Visit"
                  sortDirection={sortDirFor("lastVisit")}
                  onSortClick={() => cycleSort("lastVisit")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by last visit"
                      isActive={lastVisitFilter !== "all"}
                      onClear={() => setLastVisitFilter("all")}
                    >
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
              <TableHead className="text-center">
                <ColumnHeader
                  label="Reports"
                  sortDirection={sortDirFor("reports")}
                  onSortClick={() => cycleSort("reports")}
                  filter={
                    <ColumnFilter
                      ariaLabel="Filter by report presence"
                      isActive={reportsFilter !== "all"}
                      onClear={() => setReportsFilter("all")}
                    >
                      <PopoverField label="Reports">
                        <PopoverSelect
                          value={reportsFilter}
                          onChange={(v) =>
                            setReportsFilter(
                              v as "all" | "with" | "without",
                            )
                          }
                          options={[
                            { value: "all", label: "Any" },
                            { value: "with", label: "Has reports" },
                            { value: "without", label: "No reports yet" },
                          ]}
                        />
                      </PopoverField>
                    </ColumnFilter>
                  }
                />
              </TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-0">
                  <EmptyState
                    icon={Search}
                    title={
                      query || extraFilterCount > 0
                        ? "No patients match your filters"
                        : "No patients yet"
                    }
                    description={
                      query || extraFilterCount > 0
                        ? `Try a different name, ID, phone, or clear the column filters.`
                        : "Register your first patient to start creating reports."
                    }
                    action={
                      query || extraFilterCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            clearColumnFilters();
                          }}
                          className="text-brand-700 hover:text-brand-800 text-sm font-medium underline-offset-2 hover:underline"
                        >
                          Clear search and filters
                        </button>
                      ) : (
                        <Link
                          href="/patients/new"
                          className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-sm transition-colors"
                        >
                          <UserPlus className="h-4 w-4" />
                          Register patient
                        </Link>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((p) => (
                <TableRow
                  key={p.id}
                  className="hover:bg-brand-50/40 border-b border-neutral-100 transition-colors last:border-0"
                >
                  <TableCell className="font-mono text-sm text-neutral-500">
                    {p.patientCode}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/patients/${p.id}`}
                      className="hover:text-brand-700 font-medium text-neutral-900 transition-colors"
                    >
                      {getPatientFullName(p)}
                    </Link>
                    {p.email && (
                      <div className="text-muted-foreground mt-0.5 text-xs">{p.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-700">{p.gender}</TableCell>
                  <TableCell className="text-sm text-neutral-700">{p.age}</TableCell>
                  <TableCell className="font-mono text-sm text-neutral-700">{formatPhone(p.phone)}</TableCell>
                  <TableCell className="align-top">
                    <Timestamp at={lastVisitByPatient.get(p.id) ?? p.lastVisit} />
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const count = reportCountByPatient.get(p.id) ?? 0;
                      return (
                        <span
                          className={cn(
                            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-medium tabular-nums",
                            count > 0
                              ? "bg-brand-50 text-brand-700 ring-brand-100 ring-1"
                              : "bg-neutral-100 text-neutral-500",
                          )}
                        >
                          {count}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label="Patient actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem render={<Link href={`/patients/${p.id}`} />}>
                          View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href={`/patients/${p.id}/edit`} />}>
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem render={<Link href={`/reports/new?patient=${p.id}`} />}>
                          <FileText className="mr-2 h-4 w-4" />
                          New report
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
