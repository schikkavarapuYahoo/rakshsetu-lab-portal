"use client";

import {
  Eye,
  EyeOff,
  Library,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  MASTER_TEST_LIBRARY,
  type MasterTest,
  type TestCategory,
} from "@/config/master-tests";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading-states";
import { PageHeader } from "@/components/common/page-header";
import { SectionHeader } from "@/components/common/section-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useLabCatalogStore,
  type LabTest,
} from "@/lib/stores/lab-catalog";
import { cn } from "@/lib/utils";

type StatusFilter = "All" | "Enabled" | "Disabled";

export default function TestCatalogPage() {
  const labTests = useLabCatalogStore((s) => s.tests);
  const addFromMaster = useLabCatalogStore((s) => s.addFromMaster);
  const setActive = useLabCatalogStore((s) => s.setActive);
  const deleteTest = useLabCatalogStore((s) => s.deleteTest);
  const hasHydrated = useLabCatalogStore.persist?.hasHydrated() ?? true;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");

  const sortedTests = useMemo(
    () =>
      [...labTests].sort((a, b) => {
        // Active rows first, then by name.
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [labTests],
  );

  const filteredTests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedTests.filter((t) => {
      if (status === "Enabled" && !t.isActive) return false;
      if (status === "Disabled" && t.isActive) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [sortedTests, query, status]);

  // Master tests this lab hasn't enabled yet (no row in the catalog at all).
  const availableMaster = useMemo<MasterTest[]>(() => {
    const have = new Set(
      labTests.map((t) => t.masterCode).filter(Boolean) as string[],
    );
    return MASTER_TEST_LIBRARY.filter((m) => !have.has(m.code));
  }, [labTests]);

  // Categories actually represented in the available-master pool, with
  // their count. Lets the user filter the picker to one category at a time
  // and bulk-add an entire category (useful when onboarding a new lab —
  // "add the whole biochemistry pack" beats clicking 12 cards).
  const availableMasterCategories = useMemo(() => {
    const counts = new Map<TestCategory, number>();
    for (const m of availableMaster) {
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [availableMaster]);

  const [masterCategoryFilter, setMasterCategoryFilter] =
    useState<TestCategory | "All">("All");

  const visibleMaster = useMemo(
    () =>
      masterCategoryFilter === "All"
        ? availableMaster
        : availableMaster.filter((m) => m.category === masterCategoryFilter),
    [availableMaster, masterCategoryFilter],
  );

  function handleAddFromMaster(code: string) {
    try {
      const added = addFromMaster(code);
      toast.success(`${added.name} added to your catalog`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add test");
    }
  }

  function handleAddMany(masters: MasterTest[]) {
    if (masters.length === 0) return;
    let added = 0;
    const failures: string[] = [];
    for (const m of masters) {
      try {
        addFromMaster(m.code);
        added++;
      } catch (err) {
        failures.push(
          err instanceof Error ? `${m.code}: ${err.message}` : m.code,
        );
      }
    }
    if (added > 0) {
      toast.success(
        `Added ${added} test${added === 1 ? "" : "s"} to your catalog`,
      );
    }
    if (failures.length > 0) {
      toast.error(
        `${failures.length} test${failures.length === 1 ? "" : "s"} failed: ${failures.slice(0, 2).join("; ")}${failures.length > 2 ? "…" : ""}`,
      );
    }
  }

  function handleToggle(test: LabTest) {
    try {
      setActive(test.id, !test.isActive);
      toast.success(
        test.isActive ? `${test.name} disabled` : `${test.name} enabled`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  function handleDelete(test: LabTest) {
    if (test.source !== "custom") return;
    const ok = window.confirm(
      `Delete "${test.name}" from this lab's catalog?\n\nThis only removes it from the picker. Reports already created using this test keep their results — but you won't be able to create new reports with this custom test unless you add it back.`,
    );
    if (!ok) return;
    try {
      deleteTest(test.id);
      toast.success(`${test.name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const counts = useMemo(
    () => ({
      All: labTests.length,
      Enabled: labTests.filter((t) => t.isActive).length,
      Disabled: labTests.filter((t) => !t.isActive).length,
    }),
    [labTests],
  );

  if (!hasHydrated) return <PageSkeleton maxWidth="max-w-6xl" />;

  return (
    <div className="mx-auto max-w-400">
      <PageHeader
        back={{ href: "/settings", label: "Back to settings" }}
        title="Test catalog"
        description="Manage the tests your lab offers. Enable common tests from the master library, customise reference ranges and units to match your analyzer, set your prices, or add fully custom tests."
        actions={
          <Link
            href="/settings/tests/new"
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plus className="h-4 w-4" />
            Custom test
          </Link>
        }
      />

      {/* Available master tests — shows only if any are not yet enabled. */}
      {availableMaster.length > 0 && (
        <section className="mb-8 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4 text-neutral-500" />
              <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                Available in the master library
              </h2>
              <span className="text-muted-foreground text-xs">
                {availableMaster.length} not yet in your catalog
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleAddMany(visibleMaster)}
              disabled={visibleMaster.length === 0}
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {masterCategoryFilter === "All"
                ? `Add all ${visibleMaster.length}`
                : `Add all ${visibleMaster.length} ${masterCategoryFilter}`}
            </button>
          </div>

          {/* Category filter chips — let the lab onboard one section at a
              time (e.g. enable just the biochemistry pack). */}
          {availableMasterCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 border-b border-neutral-100 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setMasterCategoryFilter("All")}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                  masterCategoryFilter === "All"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
                )}
              >
                All
                <span className="ml-0.5 text-[10px] text-neutral-400 tabular-nums">
                  {availableMaster.length}
                </span>
              </button>
              {availableMasterCategories.map(({ category, count }) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setMasterCategoryFilter(category)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                    masterCategoryFilter === category
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
                  )}
                >
                  {category}
                  <span className="ml-0.5 text-[10px] text-neutral-400 tabular-nums">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleMaster.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => handleAddFromMaster(m.code)}
                className="hover:border-brand-300 hover:bg-brand-50/40 group flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-900">
                    {m.name}
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className="font-mono">{m.code}</span>
                    <span aria-hidden>·</span>
                    <span>{m.category}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {m.parameters.length} param
                      {m.parameters.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <Plus className="text-brand-600 mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </section>
      )}

      <SectionHeader title="Your catalog" meta={`${labTests.length} tests`} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tests by name, code, or category..."
            className="focus-visible:ring-brand-500/30 h-10 rounded-lg border-neutral-200 bg-white pl-9 shadow-sm"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["All", "Enabled", "Disabled"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              s === status
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
            )}
          >
            {s}
            <span className="ml-1 text-[11px] text-neutral-400 tabular-nums">
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-neutral-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Test
              </TableHead>
              <TableHead className="w-36 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Category
              </TableHead>
              <TableHead className="w-28 text-right text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Parameters
              </TableHead>
              <TableHead className="w-28 text-right text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                TAT
              </TableHead>
              <TableHead className="w-24 text-right text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Price
              </TableHead>
              <TableHead className="w-24 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Status
              </TableHead>
              <TableHead className="w-32 text-right text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTests.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-0">
                  <EmptyState
                    icon={Search}
                    title="No tests match your filters"
                    description="Try clearing the search or status filter."
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setStatus("All");
                        }}
                        className="text-brand-700 hover:text-brand-800 text-sm font-medium underline-offset-2 hover:underline"
                      >
                        Clear filters
                      </button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredTests.map((t) => (
                <TableRow
                  key={t.id}
                  className={cn(
                    "border-b border-neutral-100 transition-colors last:border-0",
                    !t.isActive && "bg-neutral-50/40 text-neutral-500",
                  )}
                >
                  <TableCell className="align-top">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-900">
                          {t.name}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-500">
                          {t.code}
                        </div>
                      </div>
                      {t.source === "custom" && (
                        <StatusBadge
                          variant="accent"
                          size="sm"
                          icon={<Sparkles />}
                          title="Custom test created by this lab"
                        >
                          Custom
                        </StatusBadge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge size="sm">{t.category}</StatusBadge>
                  </TableCell>
                  <TableCell className="align-top text-right text-sm text-neutral-700 tabular-nums">
                    {t.parameters.length}
                  </TableCell>
                  <TableCell className="align-top text-right text-sm text-neutral-700 tabular-nums">
                    {formatTat(t.turnaroundMinutes)}
                  </TableCell>
                  <TableCell className="align-top text-right text-sm text-neutral-700 tabular-nums">
                    {typeof t.basePrice === "number"
                      ? `₹${t.basePrice.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {t.isActive ? (
                      <StatusBadge variant="success" size="sm">
                        Enabled
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant="neutral" size="sm">
                        Disabled
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t.isActive ? "Disable test" : "Enable test"}
                        title={t.isActive ? "Disable test" : "Enable test"}
                        onClick={() => handleToggle(t)}
                      >
                        {t.isActive ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Link
                        href={`/settings/tests/${t.id}/edit`}
                        aria-label={`Edit ${t.name}`}
                        title={`Edit ${t.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      {t.source === "custom" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${t.name}`}
                          title={`Delete ${t.name}`}
                          onClick={() => handleDelete(t)}
                          className="text-neutral-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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

function formatTat(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h}h ${m}m`;
  }
  const days = Math.round(minutes / 1440);
  return `${days} d`;
}
