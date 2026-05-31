"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OutlinedInput } from "@/components/ui/outlined-input";
import { OutlinedSelect } from "@/components/ui/outlined-select";
import { OutlinedTextarea } from "@/components/ui/outlined-textarea";
import type { TestCategory } from "@/config/master-tests";
import {
  getPatientFullName,
  usePatientsStore,
  type Patient,
} from "@/lib/stores/patients";
import { Timestamp } from "@/components/common/timestamp";
import {
  type CheckInVitals,
  type FastingStatus,
  type NewReportInput,
  type PregnancyStatus,
  type ResultFlag,
  useReportsStore,
} from "@/lib/stores/reports";
import { useLabCatalogStore, type LabTest } from "@/lib/stores/lab-catalog";
import {
  reportSchema,
  type ReportFormValues,
} from "@/lib/validators/report";
import {
  confirmDiscard,
  useUnsavedChangesWarning,
} from "@/hooks/use-unsaved-changes-warning";
import { cn } from "@/lib/utils";
import { flagForValue } from "@/lib/utils/auto-flag";

const FLAG_OPTIONS: { value: ResultFlag | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "Low", label: "Low" },
  { value: "Normal", label: "Normal" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

const FASTING_OPTIONS = [
  { value: "", label: "Not asked" },
  { value: "none", label: "Not fasting" },
  { value: "lt4h", label: "Less than 4 hours" },
  { value: "4to8h", label: "4–8 hours" },
  { value: "8plus", label: "8+ hours" },
];

const PREGNANCY_OPTIONS = [
  { value: "", label: "Not asked" },
  { value: "no", label: "Not pregnant" },
  { value: "yes", label: "Pregnant" },
  { value: "unknown", label: "Unknown / possibly" },
];

/**
 * Build a `CheckInVitals` snapshot from form values. Returns undefined
 * if no field was captured — keeps the resulting Report rows clean of
 * an empty `checkIn` object.
 */
function buildCheckIn(values: ReportFormValues): CheckInVitals | undefined {
  const parse = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  const symptoms = (values.symptoms ?? "").trim();
  const lmp = (values.lmpDate ?? "").trim();
  const candidate: CheckInVitals = {
    bpSystolic: parse(values.bpSystolic),
    bpDiastolic: parse(values.bpDiastolic),
    pulseBpm: parse(values.pulseBpm),
    temperatureF: parse(values.temperatureF),
    fastingStatus: (values.fastingStatus as FastingStatus | undefined) ?? undefined,
    symptoms: symptoms === "" ? undefined : symptoms,
    isPregnant: (values.isPregnant as PregnancyStatus | undefined) ?? undefined,
    lmpDate: lmp === "" ? undefined : lmp,
  };
  const hasAny = Object.values(candidate).some((v) => v !== undefined);
  return hasAny ? candidate : undefined;
}

interface ResultRowDraft {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: ResultFlag | "";
  /**
   * True when `flag` was set by the auto-flag heuristic rather than a
   * manual pick. We re-run the heuristic on value change ONLY for rows
   * still in auto mode — once the tech overrides, their pick stays.
   */
  autoFlagged?: boolean;
}

interface TestDraft {
  /** Stable client key used for React list rendering. */
  key: string;
  /** Catalog code (e.g. "CBC") or "__custom" for free-form tests. */
  source: string;
  testName: string;
  testCode: string;
  results: ResultRowDraft[];
  /** Receptionists usually skip results at creation, so default to collapsed. */
  resultsExpanded: boolean;
  /** Per-test price override in rupees. undefined = use catalog basePrice.
   *  Lets the receptionist adjust a single test's price for this visit
   *  (insurance rate, regular customer discount, partial repeat, etc.). */
  priceOverride?: number;
}

const emptyRow = (): ResultRowDraft => ({
  parameter: "",
  value: "",
  unit: "",
  referenceRange: "",
  flag: "",
});

function draftFromLabTest(test: LabTest): TestDraft {
  return {
    key: crypto.randomUUID(),
    source: test.id,
    testName: test.name,
    testCode: test.code,
    results: test.parameters.map((p) => ({
      parameter: p.parameter,
      value: "",
      unit: p.unit ?? "",
      referenceRange: p.referenceRange ?? "",
      flag: "",
    })),
    resultsExpanded: false,
  };
}

function customDraft(): TestDraft {
  return {
    key: crypto.randomUUID(),
    source: "__custom",
    testName: "",
    testCode: "",
    results: [emptyRow()],
    resultsExpanded: true,
  };
}

export default function NewReportPage() {
  // useSearchParams() bails out of static prerendering, so it must live
  // inside a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-400">
          <div className="text-muted-foreground text-sm">Loading...</div>
        </div>
      }
    >
      <NewReportContent />
    </Suspense>
  );
}

function NewReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get("patient") ?? "";

  const patients = usePatientsStore((s) => s.patients);
  const setVitals = usePatientsStore((s) => s.setVitals);
  const addReports = useReportsStore((s) => s.addReports);
  const allReports = useReportsStore((s) => s.reports);
  const allLabTests = useLabCatalogStore((s) => s.tests);

  const patientOptions = useMemo(
    () =>
      patients.map((p) => ({
        value: p.id,
        label: `${p.patientCode} · ${getPatientFullName(p)}`,
      })),
    [patients],
  );

  const activeLabTests = useMemo(
    () => allLabTests.filter((t) => t.isActive),
    [allLabTests],
  );

  // Lookup by id so each `SelectedTestCard` can surface this lab's
  // collection details (sample type, tube colour, patient prep).
  const labTestsById = useMemo(() => {
    const m = new Map<string, LabTest>();
    for (const t of allLabTests) m.set(t.id, t);
    return m;
  }, [allLabTests]);

  // Picker filters — search + category. Search matches name, code, and
  // category so a tech who types "thy" finds Thyroid Panel; "fbs" finds
  // Fasting Blood Sugar. Category chips narrow the grid to one department.
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<TestCategory | "All">(
    "All",
  );

  const pickerCategories = useMemo(() => {
    const counts = new Map<TestCategory, number>();
    for (const t of activeLabTests) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [activeLabTests]);

  const filteredLabTests = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return activeLabTests.filter((t) => {
      if (pickerCategory !== "All" && t.category !== pickerCategory)
        return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [activeLabTests, pickerCategory, pickerQuery]);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      patientId: preselectedPatientId,
      requestingDoctor: "",
      referringHospital: "",
      collectedAt: "",
      reportedAt: "",
      notes: "",
      heightCm: "",
      weightKg: "",
      bpSystolic: "",
      bpDiastolic: "",
      pulseBpm: "",
      temperatureF: "",
      fastingStatus: undefined,
      symptoms: "",
      isPregnant: undefined,
      lmpDate: "",
      tests: [],
    },
  });

  // When the receptionist selects a patient, prefill the check-in vitals
  // with the last-known values on file so the common case ("nothing
  // changed since the last visit") is a single tap. The technician can
  // overwrite either field if the patient was weighed/measured today.
  const watchedPatientId = form.watch("patientId");
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === watchedPatientId),
    [patients, watchedPatientId],
  );
  // Most recent prior visit's check-in snapshot for this patient. Skips
  // cancelled reports (which often have no real check-in) and prefers
  // the highest createdAt. Used to prefill BP, pulse, temp, fasting,
  // and pregnancy fields so the receptionist only needs to update
  // what actually changed since the last visit.
  const previousCheckIn = useMemo(() => {
    if (!watchedPatientId) return undefined;
    const candidates = allReports
      .filter(
        (r) =>
          r.patientId === watchedPatientId &&
          r.status !== "Cancelled" &&
          r.checkIn,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return candidates[0]?.checkIn;
  }, [allReports, watchedPatientId]);
  useEffect(() => {
    if (!selectedPatient) return;
    // Only fill if the field is empty — don't clobber a value the
    // receptionist just typed. Same rule applies to every field below.
    const fillIfEmpty = (name: keyof ReportFormValues, value: unknown) => {
      const current = form.getValues(name);
      if ((current === "" || current === undefined) && value !== undefined) {
        form.setValue(name, value as never);
      }
    };
    // Persistent vitals carry on the patient record itself.
    if (typeof selectedPatient.heightCm === "number") {
      fillIfEmpty("heightCm", String(selectedPatient.heightCm));
    }
    if (typeof selectedPatient.weightKg === "number") {
      fillIfEmpty("weightKg", String(selectedPatient.weightKg));
    }
    // Visit-level vitals come from the most recent prior visit's
    // snapshot. Symptoms is intentionally NOT carried over — it's the
    // chief complaint for today's visit, not a recurring vital.
    if (previousCheckIn) {
      fillIfEmpty(
        "bpSystolic",
        typeof previousCheckIn.bpSystolic === "number"
          ? String(previousCheckIn.bpSystolic)
          : undefined,
      );
      fillIfEmpty(
        "bpDiastolic",
        typeof previousCheckIn.bpDiastolic === "number"
          ? String(previousCheckIn.bpDiastolic)
          : undefined,
      );
      fillIfEmpty(
        "pulseBpm",
        typeof previousCheckIn.pulseBpm === "number"
          ? String(previousCheckIn.pulseBpm)
          : undefined,
      );
      fillIfEmpty(
        "temperatureF",
        typeof previousCheckIn.temperatureF === "number"
          ? String(previousCheckIn.temperatureF)
          : undefined,
      );
      fillIfEmpty("fastingStatus", previousCheckIn.fastingStatus);
      fillIfEmpty("isPregnant", previousCheckIn.isPregnant);
      fillIfEmpty("lmpDate", previousCheckIn.lmpDate);
    }
  }, [selectedPatient, previousCheckIn, form]);

  // Pregnancy + LMP only make sense for female patients of reproductive
  // age. Conservative range — ask anyway in unclear cases (e.g. age 11
  // or 56) rather than silently hide a clinically-relevant question.
  const showPregnancyFields =
    selectedPatient?.gender === "Female" &&
    selectedPatient.age >= 12 &&
    selectedPatient.age <= 55;

  // Tests live outside react-hook-form because each test row has its own
  // editable result table. We mirror the array into the form whenever it
  // changes so zod's `tests.min(1)` validation still fires on submit.
  const [tests, setTests] = useState<TestDraft[]>([]);

  useEffect(() => {
    form.setValue(
      "tests",
      tests.map((t) => ({
        testName: t.testName,
        testCode: t.testCode || undefined,
        results: t.results
          .filter((r) => r.parameter.trim() !== "")
          .map((r) => ({
            parameter: r.parameter,
            value: r.value,
            unit: r.unit || undefined,
            referenceRange: r.referenceRange || undefined,
            flag: r.flag || undefined,
          })),
      })),
      { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
    );
  }, [tests, form]);

  const isDirty = form.formState.isDirty || tests.length > 0;
  useUnsavedChangesWarning(isDirty);

  // Visit-level discount in rupees (applied to subtotal). Lets the
  // receptionist take a flat amount off — e.g. corporate referral
  // discount, neighbour-discount, regular-customer goodwill — without
  // editing every test's price individually.
  const [discount, setDiscount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");

  // Explicit price-agreement gate. The Check-in section + Create button
  // stay locked until the receptionist ticks "Patient agreed to the
  // price" — mirrors the real small-lab cash workflow where the
  // technician quotes the price BEFORE drawing samples.
  const [priceAgreed, setPriceAgreed] = useState(false);
  // Re-lock automatically if all tests get cleared.
  useEffect(() => {
    if (tests.length === 0 && priceAgreed) setPriceAgreed(false);
  }, [tests.length, priceAgreed]);

  // Running total for the sticky action bar. Each test's effective
  // price = override (if set) ?? catalog basePrice. Visit-level discount
  // is subtracted from the subtotal — clamped at 0 so the total never
  // goes negative.
  const selectedSummary = useMemo(() => {
    let subtotal = 0;
    let pricedCount = 0;
    for (const t of tests) {
      if (typeof t.priceOverride === "number" && t.priceOverride >= 0) {
        subtotal += t.priceOverride;
        pricedCount++;
        continue;
      }
      if (t.source === "__custom") continue;
      const labTest = labTestsById.get(t.source);
      if (labTest && typeof labTest.basePrice === "number") {
        subtotal += labTest.basePrice;
        pricedCount++;
      }
    }
    const safeDiscount = Math.max(0, Math.min(discount, subtotal));
    const total = subtotal - safeDiscount;
    return {
      count: tests.length,
      subtotal,
      discount: safeDiscount,
      total,
      pricedCount,
    };
  }, [tests, labTestsById, discount]);

  // Catalog selection — clicking a tile toggles a test into/out of the visit.
  // `source` holds the LabTest.id for catalog picks (or "__custom" for free-form rows).
  const selectedLabTestIds = useMemo(
    () => new Set(tests.filter((t) => t.source !== "__custom").map((t) => t.source)),
    [tests],
  );

  function toggleLabTest(test: LabTest) {
    setTests((prev) => {
      const idx = prev.findIndex((t) => t.source === test.id);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, draftFromLabTest(test)];
    });
  }

  function addCustomTest() {
    setTests((prev) => [...prev, customDraft()]);
  }

  function removeTest(key: string) {
    setTests((prev) => prev.filter((t) => t.key !== key));
  }

  function updateTest(key: string, patch: Partial<TestDraft>) {
    setTests((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    );
  }

  function updateRow(
    testKey: string,
    rowIndex: number,
    patch: Partial<ResultRowDraft>,
  ) {
    setTests((prev) =>
      prev.map((t) => {
        if (t.key !== testKey) return t;
        return {
          ...t,
          results: t.results.map((r, i) => {
            if (i !== rowIndex) return r;
            const next: ResultRowDraft = { ...r, ...patch };

            // Manual flag pick → stop auto-flagging this row.
            if ("flag" in patch) {
              next.autoFlagged = false;
            }

            // Value (or reference range) changed → re-run auto-flag,
            // but only if the current flag is empty or was previously
            // auto-set. A manual pick is sacred.
            if ("value" in patch || "referenceRange" in patch) {
              if (!next.flag || next.autoFlagged) {
                const auto = flagForValue(next.value, next.referenceRange);
                next.flag = auto ?? "";
                next.autoFlagged = Boolean(auto);
              }
            }

            return next;
          }),
        };
      }),
    );
  }

  function addRow(testKey: string) {
    setTests((prev) =>
      prev.map((t) =>
        t.key === testKey ? { ...t, results: [...t.results, emptyRow()] } : t,
      ),
    );
  }

  function removeRow(testKey: string, rowIndex: number) {
    setTests((prev) =>
      prev.map((t) =>
        t.key === testKey
          ? { ...t, results: t.results.filter((_, i) => i !== rowIndex) }
          : t,
      ),
    );
  }

  async function onSubmit(values: ReportFormValues) {
    if (tests.length === 0) {
      toast.error("Add at least one test for this visit");
      return;
    }

    // Check-in: stamp the patient's vitals BEFORE creating reports so the
    // updated lastVisit + height/weight are visible in the dashboard the
    // moment the user lands on the next page.
    const heightStr = (values.heightCm ?? "").trim();
    const weightStr = (values.weightKg ?? "").trim();
    if (heightStr !== "" || weightStr !== "") {
      setVitals(values.patientId, {
        heightCm: heightStr === "" ? undefined : Number(heightStr),
        weightKg: weightStr === "" ? undefined : Number(weightStr),
      });
    }

    // Visit-level check-in snapshot (BP / pulse / temp / fasting /
    // symptoms / pregnancy / LMP). Same snapshot is duplicated onto each
    // report in this visit. Built once and held undefined if nothing was
    // captured, so the Report row stays clean.
    const checkIn = buildCheckIn(values);

    const inputs: NewReportInput[] = tests.map((t) => ({
      patientId: values.patientId,
      testName: t.testName.trim(),
      testCode: t.testCode.trim() || undefined,
      requestingDoctor: values.requestingDoctor || undefined,
      referringHospital: values.referringHospital || undefined,
      collectedAt: values.collectedAt || undefined,
      reportedAt: values.reportedAt || undefined,
      notes: values.notes || undefined,
      checkIn,
      results: t.results
        .filter((r) => r.parameter.trim() !== "")
        .map((r) => ({
          parameter: r.parameter.trim(),
          value: r.value.trim(),
          unit: r.unit.trim() || undefined,
          referenceRange: r.referenceRange.trim() || undefined,
          flag: r.flag || undefined,
        })),
    }));

    const created = await addReports(inputs);
    if (created.length === 1) {
      toast.success(`Report ${created[0]!.reportCode} created`);
      router.push(`/reports/${created[0]!.id}`);
    } else {
      toast.success(
        `Created ${created.length} reports for this visit (${created
          .map((r) => r.reportCode)
          .join(", ")})`,
      );
      router.push(`/patients/${values.patientId}`);
    }
  }

  return (
    <div className="mx-auto max-w-400">
      <div className="mb-6">
        <Link
          href="/reports"
          onClick={(e) => {
            if (!confirmDiscard(isDirty)) e.preventDefault();
          }}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
          New Report
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick one or more tests for this visit. Each test becomes its own
          report under a shared visit, so they can be tracked independently
          and delivered together.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-6 pb-24 lg:grid-cols-[1fr_360px] lg:pb-0"
        >
          {/* Main column — the form itself */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            {/* Selected-patient hero — only when a patient is in context.
                Replaces the abstract dropdown value with an avatar / name
                / metadata strip so the technician has a clear sense of
                "who am I creating this for". */}
            {selectedPatient && (
              <SelectedPatientHero patient={selectedPatient} />
            )}

            <div className="space-y-8 p-6">
              {/* Visit metadata */}
              <section className="space-y-5">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Visit details
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="patientId"
                    render={({ field, fieldState }) => (
                      <OutlinedSelect
                        label="Patient"
                        required
                        options={patientOptions}
                        value={field.value}
                        onValueChange={(v) => field.onChange(v ?? "")}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="requestingDoctor"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Prescribing doctor"
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="referringHospital"
                  render={({ field, fieldState }) => (
                    <OutlinedInput
                      label="Hospital / clinic"
                      helperText="Where the prescribing doctor practises. Shown on the printed report alongside the doctor's name."
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="collectedAt"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Sample collected"
                        type="date"
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reportedAt"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Reported on"
                        type="date"
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                </div>
              </section>

              {/* Test picker */}
              <section className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                      Tests for this visit
                    </h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Tap to add. Each selected test will be created as its own
                      report under one shared visit.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomTest}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Custom test
                  </Button>
                </div>

                {activeLabTests.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-8 text-center text-sm text-neutral-500">
                    No tests are enabled in this lab&rsquo;s catalog yet.{" "}
                    <Link
                      href="/settings/tests"
                      className="text-brand-700 hover:text-brand-800 font-medium underline-offset-2 hover:underline"
                    >
                      Set up the catalog
                    </Link>
                    , or use &ldquo;Custom test&rdquo; for a one-off.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Search — typing "thy" finds Thyroid; "fbs" finds
                        Fasting Blood Sugar. Stays responsive even with a
                        large catalog. */}
                    <div className="relative">
                      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                      <Input
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Search tests by name, code, or category..."
                        className="focus-visible:ring-brand-500/30 h-10 rounded-lg border-neutral-200 bg-white pl-9 shadow-sm"
                      />
                    </div>

                    {/* Category chips — narrow the grid to one department.
                        Only renders when the lab has more than one category
                        worth filtering. */}
                    {pickerCategories.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPickerCategory("All")}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                            pickerCategory === "All"
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
                          )}
                        >
                          All
                          <span className="ml-0.5 text-[10px] text-neutral-400 tabular-nums">
                            {activeLabTests.length}
                          </span>
                        </button>
                        {pickerCategories.map(({ category, count }) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setPickerCategory(category)}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                              pickerCategory === category
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

                    {/* Filtered tile grid */}
                    {filteredLabTests.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/40 px-4 py-8 text-center text-sm text-neutral-500">
                        <p>
                          No tests match{" "}
                          {pickerQuery && (
                            <>
                              &ldquo;
                              <span className="font-medium text-neutral-700">
                                {pickerQuery}
                              </span>
                              &rdquo;
                            </>
                          )}
                          {pickerQuery && pickerCategory !== "All" && " in "}
                          {pickerCategory !== "All" && (
                            <span className="font-medium text-neutral-700">
                              {pickerCategory}
                            </span>
                          )}
                          .
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPickerQuery("");
                            setPickerCategory("All");
                          }}
                          className="text-brand-700 hover:text-brand-800 mt-2 text-xs font-medium underline-offset-2 hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {filteredLabTests.map((t) => {
                          const isSelected = selectedLabTestIds.has(t.id);
                          const swatch =
                            TUBE_COLOR_SWATCH[t.tubeColor] ?? "bg-neutral-200";
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleLabTest(t)}
                              title={`${t.tubeColor} · ${t.sampleType}`}
                              className={cn(
                                "group relative rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                                isSelected
                                  ? "border-brand-500 bg-brand-50 text-brand-900 ring-brand-200 ring-2 ring-inset shadow-sm"
                                  : "border-neutral-200 bg-white text-neutral-700 hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm",
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "mt-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/5",
                                    swatch,
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium leading-tight">
                                    {t.name}
                                  </div>
                                  <div
                                    className={cn(
                                      "mt-0.5 flex items-center gap-1.5 font-mono text-[11px]",
                                      isSelected
                                        ? "text-brand-700/80"
                                        : "text-neutral-500",
                                    )}
                                  >
                                    <span>{t.code}</span>
                                    {typeof t.basePrice === "number" && (
                                      <>
                                        <span aria-hidden>·</span>
                                        <span className="tabular-nums">
                                          ₹{t.basePrice.toLocaleString("en-IN")}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {form.formState.errors.tests && tests.length === 0 && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.tests.message ??
                      "Add at least one test for this visit"}
                  </p>
                )}
              </section>

              {/* Selected tests with collapsible result panels */}
              {tests.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                      Selected tests ({tests.length})
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      Results are optional now — they can be entered later from
                      the report page.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {tests.map((t) => (
                      <SelectedTestCard
                        key={t.key}
                        test={t}
                        labTest={
                          t.source !== "__custom"
                            ? labTestsById.get(t.source)
                            : undefined
                        }
                        onRemove={() => removeTest(t.key)}
                        onChange={(patch) => updateTest(t.key, patch)}
                        onRowChange={(idx, patch) =>
                          updateRow(t.key, idx, patch)
                        }
                        onAddRow={() => addRow(t.key)}
                        onRemoveRow={(idx) => removeRow(t.key, idx)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Quote — explicit price-agreement gate. The receptionist
                  tells the patient the total; once the patient agrees,
                  the receptionist ticks the box. Sample collection +
                  Create only unlock after that, matching the real
                  small-lab workflow (price first, then samples). */}
              {tests.length > 0 && (
                <section className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                        Quote
                      </h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Tell the patient the total. Tick once they agree to
                        the price.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        Total
                      </div>
                      <div className="text-2xl font-semibold text-neutral-900 tabular-nums">
                        ₹{selectedSummary.total.toLocaleString("en-IN")}
                      </div>
                      <div className="text-muted-foreground text-[11px] tabular-nums">
                        {selectedSummary.count} test
                        {selectedSummary.count === 1 ? "" : "s"}
                        {selectedSummary.pricedCount <
                          selectedSummary.count && (
                          <span className="ml-1 text-neutral-400">
                            ({selectedSummary.pricedCount} priced)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discount controls — entered before patient agrees. */}
                  <div className="grid grid-cols-1 gap-3 rounded-md bg-white p-3 ring-1 ring-neutral-200 sm:grid-cols-[160px_1fr]">
                    <div className="space-y-1">
                      <Label htmlFor="visit-discount" className="text-xs">
                        Discount (₹)
                      </Label>
                      <Input
                        id="visit-discount"
                        type="number"
                        min={0}
                        max={selectedSummary.subtotal || undefined}
                        step={1}
                        value={discount === 0 ? "" : discount}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setDiscount(Number.isFinite(n) && n > 0 ? n : 0);
                        }}
                        placeholder="0"
                        className="h-9 text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="visit-discount-reason" className="text-xs">
                        Reason (optional)
                      </Label>
                      <Input
                        id="visit-discount-reason"
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="e.g. corporate referral, returning customer"
                        className="h-9"
                        maxLength={200}
                      />
                    </div>
                  </div>

                  {/* Subtotal → discount → total breakdown */}
                  {(selectedSummary.discount > 0 ||
                    selectedSummary.subtotal !== selectedSummary.total) && (
                    <div className="space-y-1 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-neutral-200">
                      <div className="flex justify-between text-neutral-600">
                        <span>Subtotal</span>
                        <span className="tabular-nums">
                          ₹{selectedSummary.subtotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                      {selectedSummary.discount > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>− Discount</span>
                          <span className="tabular-nums">
                            ₹{selectedSummary.discount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}
                      <div className="mt-1 flex justify-between border-t border-neutral-100 pt-1 font-semibold text-neutral-900">
                        <span>Total</span>
                        <span className="tabular-nums">
                          ₹{selectedSummary.total.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md bg-white px-3 py-2.5 text-sm shadow-sm ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50">
                    <Checkbox
                      checked={priceAgreed}
                      onCheckedChange={(v) => setPriceAgreed(Boolean(v))}
                    />
                    <span className="font-medium text-neutral-900">
                      Patient agreed to the price
                    </span>
                    {priceAgreed && (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Ready to collect samples
                      </span>
                    )}
                  </label>
                </section>
              )}

              {/* Check-in — vitals captured at sample-collection time.
                  Disabled until the patient has agreed to the price, so
                  we don't ask for BP/temp before the patient even
                  commits. Height/weight save to the patient record
                  (latest wins); BP / pulse / temp / fasting / symptoms /
                  pregnancy / LMP are snapshotted on each report. */}
              <section
                aria-disabled={!priceAgreed}
                className={cn(
                  "space-y-5 rounded-lg border border-neutral-200 bg-neutral-50/40 p-5 transition-opacity",
                  !priceAgreed && "pointer-events-none opacity-50",
                )}
              >
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    Check-in
                    {!priceAgreed && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        — confirm price first
                      </span>
                    )}
                  </h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {selectedPatient
                      ? previousCheckIn ||
                        typeof selectedPatient.heightCm === "number" ||
                        typeof selectedPatient.weightKg === "number"
                        ? previousCheckIn
                          ? "Vitals carried over from the last visit. Update anything that changed today."
                          : "Last-known height / weight prefilled. Capture today's vitals below."
                        : "First time recording vitals for this patient — leave blank if unknown."
                      : "Select a patient first to prefill their last-known vitals."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="heightCm"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Height (cm)"
                        type="number"
                        inputMode="decimal"
                        min={30}
                        max={272}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weightKg"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Weight (kg)"
                        type="number"
                        inputMode="decimal"
                        min={0.5}
                        max={635}
                        step={0.1}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="bpSystolic"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="BP Systolic (mmHg)"
                        type="number"
                        inputMode="numeric"
                        min={40}
                        max={300}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bpDiastolic"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="BP Diastolic (mmHg)"
                        type="number"
                        inputMode="numeric"
                        min={20}
                        max={200}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pulseBpm"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Pulse (bpm)"
                        type="number"
                        inputMode="numeric"
                        min={20}
                        max={250}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="temperatureF"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Temperature (°F)"
                        type="number"
                        inputMode="decimal"
                        min={86}
                        max={113}
                        step={0.1}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fastingStatus"
                    render={({ field, fieldState }) => (
                      <OutlinedSelect
                        label="Fasting status"
                        options={FASTING_OPTIONS}
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v && v !== "" ? v : undefined)
                        }
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </div>

                {showPregnancyFields && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="isPregnant"
                      render={({ field, fieldState }) => (
                        <OutlinedSelect
                          label="Pregnancy"
                          options={PREGNANCY_OPTIONS}
                          value={field.value ?? ""}
                          onValueChange={(v) =>
                            field.onChange(v && v !== "" ? v : undefined)
                          }
                          error={fieldState.error?.message}
                        />
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lmpDate"
                      render={({ field, fieldState }) => (
                        <OutlinedInput
                          label="Last menstrual period"
                          type="date"
                          helperText="Important for hormone tests (FSH, LH, Estradiol, Progesterone)."
                          error={fieldState.error?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="symptoms"
                  render={({ field, fieldState }) => (
                    <OutlinedTextarea
                      label="Symptoms / reason for visit"
                      rows={2}
                      helperText='e.g. "Fever × 3 days", "Annual checkup", "Follow-up diabetes"'
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
              </section>

              <section>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field, fieldState }) => (
                    <OutlinedTextarea
                      label="Visit notes"
                      rows={3}
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
              </section>
            </div>
          </div>

          {/* Right rail — Visit summary + actions. Sticky on lg+ so the
              receptionist always sees what they've picked and can submit
              without scrolling. On mobile the sticky bottom bar (below)
              takes over instead. */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-4">
              <VisitSummaryRail
                tests={tests}
                labTestsById={labTestsById}
                total={selectedSummary.total}
                pricedCount={selectedSummary.pricedCount}
                onRemove={removeTest}
              />
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={
                      form.formState.isSubmitting ||
                      tests.length === 0 ||
                      !priceAgreed
                    }
                    className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    {form.formState.isSubmitting
                      ? "Creating..."
                      : tests.length > 1
                        ? `Create ${tests.length} reports`
                        : "Create report"}
                  </button>
                  <Button
                    variant="outline"
                    type="button"
                    className="h-10 w-full px-4"
                    onClick={() => {
                      if (confirmDiscard(isDirty)) router.push("/reports");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {/* Sticky bottom action bar — mobile-only. On desktop the
              right rail handles selection summary + actions. */}
          <div className="sticky bottom-4 z-10 lg:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-white/80">
              <div className="flex items-center gap-3 text-sm">
                {selectedSummary.count === 0 ? (
                  <span className="text-muted-foreground">
                    Pick at least one test to continue
                  </span>
                ) : !priceAgreed ? (
                  <span className="text-muted-foreground">
                    Confirm the price in the Quote section above
                  </span>
                ) : (
                  <>
                    <span className="bg-brand-50 text-brand-700 ring-brand-200 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold ring-1 ring-inset tabular-nums">
                      {selectedSummary.count}
                    </span>
                    <span className="font-medium text-neutral-900">
                      {selectedSummary.count === 1
                        ? "test ready"
                        : "tests ready"}
                    </span>
                    {selectedSummary.total > 0 && (
                      <>
                        <span aria-hidden className="text-neutral-300">
                          ·
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ₹{selectedSummary.total.toLocaleString("en-IN")}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  type="button"
                  className="h-10 px-4"
                  onClick={() => {
                    if (confirmDiscard(isDirty)) router.push("/reports");
                  }}
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={
                    form.formState.isSubmitting || tests.length === 0
                  }
                  className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FilePlus2 className="h-4 w-4" />
                  <span>
                    {form.formState.isSubmitting
                      ? "Creating..."
                      : tests.length > 1
                        ? `Create ${tests.length} reports`
                        : "Create report"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

/**
 * Visual swatch matching the standard CLSI tube colour. Used in the
 * "Sample collection" hint on each selected test so the technician can
 * grab the right tube at a glance.
 */
const TUBE_COLOR_SWATCH: Record<string, string> = {
  "Lavender (EDTA)": "bg-violet-400 ring-violet-500",
  "Red (Clot Activator)": "bg-red-500 ring-red-600",
  "Gold / Tiger (SST)": "bg-amber-400 ring-amber-500",
  "Green (Heparin)": "bg-emerald-500 ring-emerald-600",
  "Blue (Citrate)": "bg-sky-500 ring-sky-600",
  "Gray (Fluoride)": "bg-neutral-400 ring-neutral-500",
  "None / Container": "bg-neutral-100 ring-neutral-300",
  Other: "bg-neutral-200 ring-neutral-400",
};

interface SelectedTestCardProps {
  test: TestDraft;
  /** The catalog row this draft was added from, for collection details. */
  labTest?: LabTest;
  onRemove: () => void;
  onChange: (patch: Partial<TestDraft>) => void;
  onRowChange: (rowIndex: number, patch: Partial<ResultRowDraft>) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIndex: number) => void;
}

function SelectedTestCard({
  test,
  labTest,
  onRemove,
  onChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
}: SelectedTestCardProps) {
  const isCustom = test.source === "__custom";
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50/60 px-3 py-2.5">
        <button
          type="button"
          onClick={() =>
            onChange({ resultsExpanded: !test.resultsExpanded })
          }
          aria-label={
            test.resultsExpanded ? "Collapse results" : "Expand results"
          }
          className="text-neutral-400 transition-transform hover:text-neutral-700"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              test.resultsExpanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>

        <div className="min-w-0 flex-1">
          {isCustom ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
              <input
                value={test.testName}
                onChange={(e) => onChange({ testName: e.target.value })}
                placeholder="Test name (e.g. Allergy Panel)"
                className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2"
              />
              <input
                value={test.testCode}
                onChange={(e) => onChange({ testCode: e.target.value })}
                placeholder="Code"
                className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2"
              />
            </div>
          ) : (
            <div>
              <div className="text-sm font-medium text-neutral-900">
                {test.testName}
              </div>
              {test.testCode && (
                <div className="font-mono text-[11px] text-neutral-500">
                  {test.testCode}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove test"
          className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Collection details — the playbook the technician needs at the
          counter: tube colour, sample type, and any patient prep. Only
          shown for catalog tests; custom tests don't have these fields. */}
      {labTest && (
        <div className="border-b border-neutral-100 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-neutral-700">
              <span
                aria-hidden
                className={cn(
                  "h-3 w-3 rounded-full ring-1 ring-inset",
                  TUBE_COLOR_SWATCH[labTest.tubeColor] ?? "bg-neutral-200",
                )}
              />
              <span className="font-medium">{labTest.tubeColor}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-neutral-600">
              <span className="text-neutral-400">Sample:</span>
              <span className="font-medium text-neutral-800">
                {labTest.sampleType}
              </span>
            </span>
            {typeof labTest.basePrice === "number" && (
              <span className="inline-flex items-center gap-1.5 text-neutral-600 tabular-nums">
                <span className="text-neutral-400">Price:</span>
                <span className="inline-flex items-baseline gap-0.5">
                  <span className="font-medium text-neutral-800">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={test.priceOverride ?? labTest.basePrice}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      onChange({
                        priceOverride: Number.isFinite(n) && n >= 0 ? n : 0,
                      });
                    }}
                    className={cn(
                      "w-20 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20",
                      typeof test.priceOverride === "number" &&
                        test.priceOverride !== labTest.basePrice &&
                        "border-amber-300 bg-amber-50 font-semibold",
                    )}
                    aria-label="Override price for this test"
                  />
                </span>
                {typeof test.priceOverride === "number" &&
                  test.priceOverride !== labTest.basePrice && (
                    <button
                      type="button"
                      onClick={() => onChange({ priceOverride: undefined })}
                      className="text-[10px] text-amber-700 hover:underline"
                      aria-label="Reset to catalog price"
                    >
                      reset to ₹{labTest.basePrice.toLocaleString("en-IN")}
                    </button>
                  )}
              </span>
            )}
          </div>
          {labTest.patientPrep && (
            <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
              <span className="font-medium">Patient prep: </span>
              <span>{labTest.patientPrep}</span>
            </div>
          )}
        </div>
      )}

      {test.resultsExpanded && (
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">
              Results
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddRow}
              className="gap-1.5"
            >
              <Plus className="h-3 w-3" />
              Add row
            </Button>
          </div>

          {test.results.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50/60 px-3 py-6 text-center text-xs text-neutral-500">
              No result rows. Add one to enter values now, or leave empty to
              fill in later.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/80">
                  <tr className="border-b border-neutral-200 text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">
                    <th className="px-3 py-1.5 text-left">Parameter</th>
                    <th className="px-3 py-1.5 text-left">Value</th>
                    <th className="w-24 px-3 py-1.5 text-left">Unit</th>
                    <th className="w-32 px-3 py-1.5 text-left">Range</th>
                    <th className="w-24 px-3 py-1.5 text-left">Flag</th>
                    <th className="w-8 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {test.results.map((row, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        "border-b border-neutral-100 last:border-0",
                        row.flag === "Critical" && "bg-red-50/40",
                        row.flag === "High" && "bg-amber-50/40",
                        row.flag === "Low" && "bg-sky-50/40",
                      )}
                    >
                      <td className="px-2 py-1">
                        <input
                          value={row.parameter}
                          onChange={(e) =>
                            onRowChange(idx, { parameter: e.target.value })
                          }
                          placeholder="e.g. Hemoglobin"
                          className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:ring-2"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={row.value}
                          onChange={(e) =>
                            onRowChange(idx, { value: e.target.value })
                          }
                          placeholder="—"
                          className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm tabular-nums outline-none focus:ring-2"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={row.unit}
                          onChange={(e) =>
                            onRowChange(idx, { unit: e.target.value })
                          }
                          placeholder="—"
                          className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:ring-2"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={row.referenceRange}
                          onChange={(e) =>
                            onRowChange(idx, {
                              referenceRange: e.target.value,
                            })
                          }
                          placeholder="—"
                          className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:ring-2"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={row.flag}
                          onChange={(e) =>
                            onRowChange(idx, {
                              flag: e.target.value as ResultFlag | "",
                            })
                          }
                          className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:ring-2"
                        >
                          {FLAG_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveRow(idx)}
                          aria-label="Remove row"
                          className="rounded-md p-0.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Visit summary rail (lg+ only)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Group the visit's tests by tube colour + sample type so the technician
 * knows "1 lavender tube + 1 gold SST tube + 1 urine cup" before they
 * approach the patient. Custom tests are bucketed under "Custom" since
 * they have no catalog tube/sample info.
 */
interface SampleGroup {
  tubeColor: string;
  sampleType: string;
  testNames: string[];
}

function groupSamples(
  tests: TestDraft[],
  labTestsById: Map<string, LabTest>,
): { groups: SampleGroup[]; customCount: number } {
  const byKey = new Map<string, SampleGroup>();
  let customCount = 0;
  for (const t of tests) {
    if (t.source === "__custom") {
      customCount++;
      continue;
    }
    const lab = labTestsById.get(t.source);
    if (!lab) continue;
    const key = `${lab.tubeColor}|${lab.sampleType}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.testNames.push(lab.name);
    } else {
      byKey.set(key, {
        tubeColor: lab.tubeColor,
        sampleType: lab.sampleType,
        testNames: [lab.name],
      });
    }
  }
  return { groups: Array.from(byKey.values()), customCount };
}

function VisitSummaryRail({
  tests,
  labTestsById,
  total,
  pricedCount,
  onRemove,
}: {
  tests: TestDraft[];
  labTestsById: Map<string, LabTest>;
  total: number;
  pricedCount: number;
  onRemove: (key: string) => void;
}) {
  const { groups: sampleGroups, customCount } = groupSamples(
    tests,
    labTestsById,
  );
  const totalSamples = sampleGroups.length + (customCount > 0 ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
          Visit summary
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {tests.length === 0
            ? "No tests"
            : `${tests.length} test${tests.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Samples to collect — grouped by tube/sample so the technician
          knows the exact set of containers to grab from the rack. */}
      {tests.length > 0 && (
        <div className="border-b border-neutral-100 px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              Samples to collect
            </h4>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {totalSamples} sample{totalSamples === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {sampleGroups.map((g) => {
              const swatch =
                TUBE_COLOR_SWATCH[g.tubeColor] ?? "bg-neutral-200";
              return (
                <li
                  key={`${g.tubeColor}|${g.sampleType}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/5",
                      swatch,
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-800">
                      1 × {g.tubeColor}
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">
                      {g.sampleType} · {g.testNames.join(", ")}
                    </div>
                  </div>
                </li>
              );
            })}
            {customCount > 0 && (
              <li className="flex items-start gap-2 text-xs">
                <span
                  aria-hidden
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-200 ring-1 ring-inset ring-black/5"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-800">
                    {customCount} custom test{customCount === 1 ? "" : "s"}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    Sample type not in catalog — confirm with the technician.
                  </div>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="text-muted-foreground px-4 py-6 text-center text-xs">
          Pick tests from the picker to add them here.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {tests.map((t) => {
            const labTest =
              t.source !== "__custom" ? labTestsById.get(t.source) : undefined;
            const swatch = labTest
              ? (TUBE_COLOR_SWATCH[labTest.tubeColor] ?? "bg-neutral-200")
              : "bg-neutral-200";
            const price = labTest?.basePrice;
            return (
              <li
                key={t.key}
                className="flex items-start gap-2 px-4 py-2.5 text-sm"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/5",
                    swatch,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-neutral-900">
                    {t.testName || "Custom test"}
                  </div>
                  {t.testCode && (
                    <div className="text-muted-foreground font-mono text-[11px]">
                      {t.testCode}
                    </div>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {typeof price === "number"
                    ? `₹${price.toLocaleString("en-IN")}`
                    : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(t.key)}
                  aria-label={`Remove ${t.testName || "test"}`}
                  className="text-muted-foreground -mr-1 rounded p-1 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && (
        <div className="flex items-baseline justify-between border-t border-neutral-100 bg-neutral-50/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="text-base font-semibold text-neutral-900 tabular-nums">
            ₹{total.toLocaleString("en-IN")}
            {pricedCount < tests.length && (
              <span className="ml-1 text-[11px] font-normal text-neutral-400">
                ({pricedCount}/{tests.length} priced)
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Selected-patient hero strip
// ────────────────────────────────────────────────────────────────────────────

function SelectedPatientHero({ patient }: { patient: Patient }) {
  const fullName = getPatientFullName(patient);
  const initials = `${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}`.toUpperCase();
  return (
    <div className="from-brand-50/70 to-background flex flex-wrap items-center gap-4 border-b border-neutral-100 bg-linear-to-b px-6 py-4">
      <div className="from-brand-500 to-brand-700 ring-brand-200/60 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-sm font-semibold text-white shadow-sm ring-4">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-neutral-900">
            {fullName}
          </span>
          <span className="bg-brand-50 text-brand-700 ring-brand-100 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ring-1 ring-inset">
            {patient.patientCode}
          </span>
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{patient.gender}</span>
          <span aria-hidden>·</span>
          <span>{patient.age} years</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{patient.phone}</span>
          {patient.lastVisit && (
            <>
              <span aria-hidden>·</span>
              <span>Last visit </span>
              <Timestamp
                at={patient.lastVisit}
                className="inline-flex flex-row items-baseline gap-1 leading-none"
              />
            </>
          )}
        </div>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {typeof patient.heightCm === "number" && (
          <span>
            <span className="text-neutral-400">Ht </span>
            <span className="font-medium text-neutral-800 tabular-nums">
              {patient.heightCm} cm
            </span>
          </span>
        )}
        {typeof patient.weightKg === "number" && (
          <span>
            <span className="text-neutral-400">Wt </span>
            <span className="font-medium text-neutral-800 tabular-nums">
              {patient.weightKg} kg
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
