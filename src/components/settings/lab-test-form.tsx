"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { OutlinedInput } from "@/components/ui/outlined-input";
import { OutlinedSelect } from "@/components/ui/outlined-select";
import { OutlinedTextarea } from "@/components/ui/outlined-textarea";
import {
  confirmDiscard,
  useUnsavedChangesWarning,
} from "@/hooks/use-unsaved-changes-warning";
import type {
  MasterTestParameter,
  SampleType,
  TestCategory,
  TubeColor,
} from "@/config/master-tests";
import {
  SAMPLE_TYPES,
  TEST_CATEGORIES,
  TUBE_COLORS,
  labTestSchema,
  type LabTestFormValues,
} from "@/lib/validators/lab-test";

const CATEGORY_OPTIONS = TEST_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}));

const SAMPLE_TYPE_OPTIONS = SAMPLE_TYPES.map((s) => ({
  value: s,
  label: s,
}));

const TUBE_COLOR_OPTIONS = TUBE_COLORS.map((t) => ({
  value: t,
  label: t,
}));

interface ParameterDraft {
  parameter: string;
  unit: string;
  referenceRange: string;
}

const emptyParameter = (): ParameterDraft => ({
  parameter: "",
  unit: "",
  referenceRange: "",
});

function paramsToDraft(params: MasterTestParameter[]): ParameterDraft[] {
  return params.map((p) => ({
    parameter: p.parameter,
    unit: p.unit ?? "",
    referenceRange: p.referenceRange ?? "",
  }));
}

export interface LabTestFormInitial {
  name: string;
  code: string;
  category: TestCategory;
  description?: string;
  basePrice?: number;
  turnaroundMinutes: number;
  sampleType: SampleType;
  tubeColor: TubeColor;
  patientPrep: string;
  parameters: MasterTestParameter[];
}

export interface LabTestSubmitInput {
  name: string;
  code: string;
  category: TestCategory;
  description?: string;
  basePrice?: number;
  turnaroundMinutes: number;
  sampleType: SampleType;
  tubeColor: TubeColor;
  patientPrep: string;
  parameters: MasterTestParameter[];
}

interface LabTestFormProps {
  /** Initial values when editing. Undefined for "new custom test". */
  initial?: LabTestFormInitial;
  /** Hint shown on disabled code field when applicable. */
  codeLocked?: boolean;
  submitLabel: string;
  onSubmit: (input: LabTestSubmitInput) => void | Promise<void>;
  cancelHref: string;
}

export function LabTestForm({
  initial,
  codeLocked = false,
  submitLabel,
  onSubmit,
  cancelHref,
}: LabTestFormProps) {
  const router = useRouter();

  const form = useForm<LabTestFormValues>({
    resolver: zodResolver(labTestSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      category: initial?.category ?? "Biochemistry",
      description: initial?.description ?? "",
      basePrice:
        typeof initial?.basePrice === "number"
          ? String(initial.basePrice)
          : "",
      turnaroundMinutes:
        typeof initial?.turnaroundMinutes === "number"
          ? String(initial.turnaroundMinutes)
          : "60",
      sampleType: initial?.sampleType ?? "Whole Blood",
      tubeColor: initial?.tubeColor ?? "Lavender (EDTA)",
      patientPrep: initial?.patientPrep ?? "",
      parameters: initial?.parameters?.length
        ? initial.parameters.map((p) => ({
            parameter: p.parameter,
            unit: p.unit ?? "",
            referenceRange: p.referenceRange ?? "",
          }))
        : [{ parameter: "", unit: "", referenceRange: "" }],
    },
  });

  const [parameters, setParameters] = useState<ParameterDraft[]>(
    initial?.parameters?.length
      ? paramsToDraft(initial.parameters)
      : [emptyParameter()],
  );

  useEffect(() => {
    form.setValue(
      "parameters",
      parameters.map((p) => ({
        parameter: p.parameter,
        unit: p.unit || undefined,
        referenceRange: p.referenceRange || undefined,
      })),
      { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
    );
  }, [parameters, form]);

  const isDirty = form.formState.isDirty;
  useUnsavedChangesWarning(isDirty);

  function updateParam(index: number, patch: Partial<ParameterDraft>) {
    setParameters((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  }

  function addParam() {
    setParameters((prev) => [...prev, emptyParameter()]);
  }

  function removeParam(index: number) {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(values: LabTestFormValues) {
    const trimmedParams = parameters
      .filter((p) => p.parameter.trim() !== "")
      .map((p) => ({
        parameter: p.parameter.trim(),
        unit: p.unit.trim() || undefined,
        referenceRange: p.referenceRange.trim() || undefined,
      }));

    const priceStr = (values.basePrice ?? "").trim();
    const basePrice =
      priceStr === "" ? undefined : Number(priceStr);

    const turnaroundMinutes = Number(values.turnaroundMinutes);

    await onSubmit({
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      category: values.category,
      description: values.description?.trim() || undefined,
      basePrice,
      turnaroundMinutes,
      sampleType: values.sampleType,
      tubeColor: values.tubeColor,
      patientPrep: values.patientPrep?.trim() ?? "",
      parameters: trimmedParams,
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8"
          >
            <section className="space-y-5">
              <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                Test details
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <OutlinedInput
                      label="Test name"
                      required
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <OutlinedInput
                      label="Code"
                      required
                      disabled={codeLocked}
                      helperText={
                        codeLocked
                          ? "Code is locked for master-derived tests"
                          : undefined
                      }
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field, fieldState }) => (
                    <OutlinedSelect
                      label="Category"
                      required
                      options={CATEGORY_OPTIONS}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="turnaroundMinutes"
                  render={({ field, fieldState }) => (
                    <OutlinedInput
                      label="Turnaround (min)"
                      required
                      type="number"
                      inputMode="numeric"
                      helperText="Time from sample collection to result. CBC ≈ 30, Thyroid ≈ 240, Vitamin D ≈ 1440 (24h)."
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="basePrice"
                  render={({ field, fieldState }) => (
                    <OutlinedInput
                      label="Price (₹)"
                      type="number"
                      inputMode="decimal"
                      helperText="Leave empty if not billing per-test yet"
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field, fieldState }) => (
                  <OutlinedTextarea
                    label="Description"
                    rows={2}
                    error={fieldState.error?.message}
                    {...field}
                  />
                )}
              />
            </section>

            {/* Sample collection — surfaces to the technician at the
                moment they pick this test on a new report. Keeps tube
                colour, sample type and prep in one place. */}
            <section className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Sample collection
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Shown to the technician and receptionist when they pick this
                  test. Wrong tube = redraw, wrong prep = invalid result.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sampleType"
                  render={({ field, fieldState }) => (
                    <OutlinedSelect
                      label="Sample type"
                      required
                      options={SAMPLE_TYPE_OPTIONS}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="tubeColor"
                  render={({ field, fieldState }) => (
                    <OutlinedSelect
                      label="Tube / container"
                      required
                      options={TUBE_COLOR_OPTIONS}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="patientPrep"
                render={({ field, fieldState }) => (
                  <OutlinedTextarea
                    label="Patient prep instructions"
                    rows={2}
                    helperText='e.g. "Fasting 9–12 hours, water OK" or "No special preparation".'
                    error={fieldState.error?.message}
                    {...field}
                  />
                )}
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    Parameters
                  </h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    These appear as rows on every report created from this test.
                    Reference ranges should match your analyzer.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addParam}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add parameter
                </Button>
              </div>

              <div className="overflow-hidden rounded-lg border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50/80">
                    <tr className="border-b border-neutral-200 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      <th className="px-3 py-2 text-left">Parameter</th>
                      <th className="w-28 px-3 py-2 text-left">Unit</th>
                      <th className="w-40 px-3 py-2 text-left">
                        Reference range
                      </th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {parameters.map((p, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-neutral-100 last:border-0"
                      >
                        <td className="px-2 py-1.5">
                          <input
                            value={p.parameter}
                            onChange={(e) =>
                              updateParam(idx, { parameter: e.target.value })
                            }
                            placeholder="e.g. Hemoglobin"
                            className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={p.unit}
                            onChange={(e) =>
                              updateParam(idx, { unit: e.target.value })
                            }
                            placeholder="e.g. g/dL"
                            className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={p.referenceRange}
                            onChange={(e) =>
                              updateParam(idx, {
                                referenceRange: e.target.value,
                              })
                            }
                            placeholder="e.g. 13.0 - 17.0"
                            className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeParam(idx)}
                            disabled={parameters.length === 1}
                            aria-label="Remove parameter"
                            className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.parameters?.message && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.parameters.message}
                </p>
              )}
            </section>

            <div className="-mx-6 -mb-6 flex items-center justify-end gap-3 border-t border-neutral-100 bg-neutral-50/60 px-6 py-4">
              <Button
                variant="outline"
                type="button"
                className="h-10 px-4"
                onClick={() => {
                  if (confirmDiscard(isDirty)) router.push(cancelHref);
                }}
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {form.formState.isSubmitting ? "Saving..." : submitLabel}
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
