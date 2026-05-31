"use client";

import { ArrowLeft, Check, Save } from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/reports/status-pill";
import { OutlinedInput } from "@/components/ui/outlined-input";
import { OutlinedSelect } from "@/components/ui/outlined-select";
import { OutlinedTextarea } from "@/components/ui/outlined-textarea";
import {
  getPatientFullName,
  usePatientsStore,
} from "@/lib/stores/patients";
import {
  FLAG_TONE,
  useReportsStore,
  type CheckInVitals,
  type FastingStatus,
  type PregnancyStatus,
  type Report,
  type ResultRow,
} from "@/lib/stores/reports";
import { flagForValue } from "@/lib/utils/auto-flag";
import { deriveAutoValues } from "@/lib/utils/auto-formulas";
import { cn } from "@/lib/utils";

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

type FlagValue = "" | "Low" | "Normal" | "High" | "Critical";

interface EditableResultRow {
  id: string;
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: FlagValue;
  notes?: string;
  autoFlagged?: boolean;
  /** True when value came from an auto-formula. A manual edit clears
   *  this so the formula can't overwrite the override on later runs. */
  autoDerived?: boolean;
}

function parseNumeric(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function buildCheckIn(values: {
  bpSystolic: string;
  bpDiastolic: string;
  pulseBpm: string;
  temperatureF: string;
  fastingStatus: FastingStatus | "";
  symptoms: string;
  isPregnant: PregnancyStatus | "";
  lmpDate: string;
}): CheckInVitals | undefined {
  const symptoms = values.symptoms.trim();
  const lmp = values.lmpDate.trim();
  const candidate: CheckInVitals = {
    bpSystolic: parseNumeric(values.bpSystolic),
    bpDiastolic: parseNumeric(values.bpDiastolic),
    pulseBpm: parseNumeric(values.pulseBpm),
    temperatureF: parseNumeric(values.temperatureF),
    fastingStatus: values.fastingStatus || undefined,
    symptoms: symptoms === "" ? undefined : symptoms,
    isPregnant: values.isPregnant || undefined,
    lmpDate: lmp === "" ? undefined : lmp,
  };
  const hasAny = Object.values(candidate).some((v) => v !== undefined);
  return hasAny ? candidate : undefined;
}

function toIsoDateInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Format as YYYY-MM-DD for <input type="date"> in local time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const report = useReportsStore((s) => s.reports.find((r) => r.id === id));
  const patient = usePatientsStore((s) =>
    report ? s.patients.find((p) => p.id === report.patientId) : undefined,
  );
  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true);

  const updateReport = useReportsStore((s) => s.updateReport);
  const setVitals = usePatientsStore((s) => s.setVitals);

  // Visit fields
  const [requestingDoctor, setRequestingDoctor] = useState(
    report?.requestingDoctor ?? "",
  );
  const [referringHospital, setReferringHospital] = useState(
    report?.referringHospital ?? "",
  );
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [collectedAt, setCollectedAt] = useState(
    report?.collectedAt ?? "",
  );

  // Patient vitals
  const [heightCm, setHeightCm] = useState(
    typeof patient?.heightCm === "number" ? String(patient.heightCm) : "",
  );
  const [weightKg, setWeightKg] = useState(
    typeof patient?.weightKg === "number" ? String(patient.weightKg) : "",
  );

  // Check-in vitals
  const ci = report?.checkIn;
  const [bpSystolic, setBpSystolic] = useState(
    typeof ci?.bpSystolic === "number" ? String(ci.bpSystolic) : "",
  );
  const [bpDiastolic, setBpDiastolic] = useState(
    typeof ci?.bpDiastolic === "number" ? String(ci.bpDiastolic) : "",
  );
  const [pulseBpm, setPulseBpm] = useState(
    typeof ci?.pulseBpm === "number" ? String(ci.pulseBpm) : "",
  );
  const [temperatureF, setTemperatureF] = useState(
    typeof ci?.temperatureF === "number" ? String(ci.temperatureF) : "",
  );
  const [fastingStatus, setFastingStatus] = useState<FastingStatus | "">(
    ci?.fastingStatus ?? "",
  );
  const [symptoms, setSymptoms] = useState(ci?.symptoms ?? "");
  const [isPregnant, setIsPregnant] = useState<PregnancyStatus | "">(
    ci?.isPregnant ?? "",
  );
  const [lmpDate, setLmpDate] = useState(ci?.lmpDate ?? "");

  // Results
  const [rows, setRows] = useState<EditableResultRow[]>(() =>
    (report?.results ?? []).map((r) => ({
      id: r.id,
      parameter: r.parameter,
      value: r.value ?? "",
      unit: r.unit ?? "",
      referenceRange: r.referenceRange ?? "",
      flag: (r.flag ?? "") as FlagValue,
      notes: r.notes,
      autoFlagged: false,
      autoDerived: false,
    })),
  );

  // Pregnancy only meaningful for female patients of reproductive age.
  const showPregnancyFields =
    patient?.gender === "Female" &&
    patient.age >= 12 &&
    patient.age <= 55;

  const isLocked = useMemo(
    () =>
      report?.status === "Published" || report?.status === "Cancelled",
    [report?.status],
  );

  if (!hasHydrated) {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }
  if (!report) return notFound();

  function updateRow(idx: number, patch: Partial<EditableResultRow>) {
    setRows((prev) => {
      // Apply patch + auto-flag the edited row. Direct value edits
      // clear autoDerived so later formula runs preserve the override.
      const stepOne = prev.map((r, i) => {
        if (i !== idx) return r;
        const next: EditableResultRow = { ...r, ...patch };
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

      if (!("value" in patch)) return stepOne;
      const derived = deriveAutoValues(report?.testCode, stepOne);
      if (derived.size === 0) return stepOne;

      return stepOne.map((r) => {
        const newValue = derived.get(r.parameter);
        if (newValue === undefined) return r;
        const canOverwrite = r.value === "" || Boolean(r.autoDerived);
        if (!canOverwrite || newValue === r.value) return r;
        const next: EditableResultRow = {
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
    });
  }

  function toResultRows(): ResultRow[] {
    return rows.map((r) => ({
      id: r.id,
      parameter: r.parameter.trim(),
      value: r.value.trim(),
      unit: r.unit.trim() || undefined,
      referenceRange: r.referenceRange.trim() || undefined,
      flag: r.flag || undefined,
      notes: r.notes,
    }));
  }

  function handleSave() {
    if (!report) return;
    try {
      const checkIn = buildCheckIn({
        bpSystolic,
        bpDiastolic,
        pulseBpm,
        temperatureF,
        fastingStatus,
        symptoms,
        isPregnant: showPregnancyFields ? isPregnant : "",
        lmpDate: showPregnancyFields ? lmpDate : "",
      });

      updateReport(report.id, {
        requestingDoctor: requestingDoctor.trim() || undefined,
        referringHospital: referringHospital.trim() || undefined,
        notes: notes.trim() || undefined,
        collectedAt: collectedAt.trim() || undefined,
        results: toResultRows(),
        checkIn,
      });

      const heightNum = parseNumeric(heightCm);
      const weightNum = parseNumeric(weightKg);
      const changedH = heightNum !== patient?.heightCm;
      const changedW = weightNum !== patient?.weightKg;
      if (patient && (changedH || changedW)) {
        setVitals(patient.id, {
          heightCm: changedH ? heightNum : undefined,
          weightKg: changedW ? weightNum : undefined,
        });
      }

      toast.success("Report updated");
      router.push(`/reports/${report.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save changes",
      );
    }
  }

  const patientName = patient ? getPatientFullName(patient) : "Unknown patient";

  return (
    <main className="mx-auto w-full max-w-400 px-6 py-8">
      <Link
        href={`/reports/${report.id}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to report
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Edit · {report.testName}
            </h1>
            <StatusPill status={report.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {report.reportCode} · {patientName}
            {patient && (
              <span className="ml-1 font-mono text-xs">
                ({patient.patientCode})
              </span>
            )}
          </p>
        </div>
      </header>

      {isLocked && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This report is <strong>{report.status}</strong>. Fields are read-only
          — published or cancelled reports cannot be edited. Cancel and create
          a new report if a correction is needed.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-8"
      >
        <fieldset disabled={isLocked} className="contents">
          <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              Visit details
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <OutlinedInput
                label="Prescribing doctor"
                value={requestingDoctor}
                onChange={(e) => setRequestingDoctor(e.target.value)}
              />
              <OutlinedInput
                label="Sample collected at"
                type="datetime-local"
                value={
                  collectedAt
                    ? new Date(collectedAt).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setCollectedAt(v ? new Date(v).toISOString() : "");
                }}
              />
            </div>
            <OutlinedInput
              label="Hospital / clinic"
              value={referringHospital}
              onChange={(e) => setReferringHospital(e.target.value)}
              helperText="Where the prescribing doctor practises."
            />
            <OutlinedTextarea
              label="Notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>

          <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
                Patient vitals
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Writes back to the patient record (height / weight follow the
                patient, not the visit).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <OutlinedInput
                label="Height (cm)"
                type="number"
                inputMode="decimal"
                min={30}
                max={272}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
              <OutlinedInput
                label="Weight (kg)"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={635}
                step={0.1}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              Check-in vitals
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <OutlinedInput
                label="BP Systolic (mmHg)"
                type="number"
                inputMode="numeric"
                min={40}
                max={300}
                value={bpSystolic}
                onChange={(e) => setBpSystolic(e.target.value)}
              />
              <OutlinedInput
                label="BP Diastolic (mmHg)"
                type="number"
                inputMode="numeric"
                min={20}
                max={200}
                value={bpDiastolic}
                onChange={(e) => setBpDiastolic(e.target.value)}
              />
              <OutlinedInput
                label="Pulse (bpm)"
                type="number"
                inputMode="numeric"
                min={20}
                max={250}
                value={pulseBpm}
                onChange={(e) => setPulseBpm(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <OutlinedInput
                label="Temperature (°F)"
                type="number"
                inputMode="decimal"
                min={86}
                max={113}
                step={0.1}
                value={temperatureF}
                onChange={(e) => setTemperatureF(e.target.value)}
              />
              <OutlinedSelect
                label="Fasting status"
                options={FASTING_OPTIONS}
                value={fastingStatus}
                onValueChange={(v) =>
                  setFastingStatus((v as FastingStatus) ?? "")
                }
              />
            </div>
            {showPregnancyFields && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <OutlinedSelect
                  label="Pregnancy"
                  options={PREGNANCY_OPTIONS}
                  value={isPregnant}
                  onValueChange={(v) =>
                    setIsPregnant((v as PregnancyStatus) ?? "")
                  }
                />
                <OutlinedInput
                  label="Last menstrual period"
                  type="date"
                  value={toIsoDateInputValue(lmpDate)}
                  onChange={(e) => setLmpDate(e.target.value)}
                  helperText="Relevant to hormone test interpretation."
                />
              </div>
            )}
            <OutlinedTextarea
              label="Symptoms / reason for visit"
              rows={2}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </section>

          <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
                Results
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Flags auto-set as you type. Pick a flag manually to override.
              </p>
            </div>
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
                      <th className="w-40 px-3 py-2 text-left">Range</th>
                      <th className="w-28 px-3 py-2 text-left">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const flagTone = row.flag ? FLAG_TONE[row.flag] : null;
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
                                updateRow(idx, { value: e.target.value })
                              }
                              placeholder="—"
                              disabled={isLocked}
                              className={cn(
                                "focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 disabled:cursor-not-allowed",
                                isCritical && "font-semibold text-red-700",
                              )}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.unit}
                              onChange={(e) =>
                                updateRow(idx, { unit: e.target.value })
                              }
                              placeholder="—"
                              disabled={isLocked}
                              className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.referenceRange}
                              onChange={(e) =>
                                updateRow(idx, {
                                  referenceRange: e.target.value,
                                })
                              }
                              placeholder="—"
                              disabled={isLocked}
                              className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.flag}
                              onChange={(e) =>
                                updateRow(idx, {
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
          </section>
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/reports/${report.id}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isLocked}
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLocked ? (
              <>Locked</>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save changes
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}
