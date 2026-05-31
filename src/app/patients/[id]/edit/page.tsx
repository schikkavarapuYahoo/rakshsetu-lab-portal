"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField } from "@/components/ui/form";
import { OutlinedEmailInput } from "@/components/ui/outlined-email-input";
import { OutlinedInput } from "@/components/ui/outlined-input";
import { OutlinedPhoneInput } from "@/components/ui/outlined-phone-input";
import { OutlinedSelect } from "@/components/ui/outlined-select";
import { OutlinedTextarea } from "@/components/ui/outlined-textarea";
import {
  DuplicatePatientError,
  type Patient,
  usePatientsStore,
} from "@/lib/stores/patients";
import { cn, formatDateOnly, toTitleCase } from "@/lib/utils";
import {
  patientSchema,
  type PatientFormValues,
} from "@/lib/validators/patient";
import {
  confirmDiscard,
  useUnsavedChangesWarning,
} from "@/hooks/use-unsaved-changes-warning";

const genderOptions = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const genderToCode: Record<string, "MALE" | "FEMALE" | "OTHER"> = {
  Male: "MALE",
  Female: "FEMALE",
  Other: "OTHER",
};

const genderToLabel: Record<"MALE" | "FEMALE" | "OTHER", "Male" | "Female" | "Other"> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

function calculateAge(dob: string): string {
  if (!dob) return "";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 150 ? String(age) : "";
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const patient = usePatientsStore((s) => s.patients.find((p) => p.id === id));
  const updatePatient = usePatientsStore((s) => s.updatePatient);
  const findDuplicates = usePatientsStore((s) => s.findDuplicates);
  const [confirmSharedPhone, setConfirmSharedPhone] = useState(false);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      gender: undefined,
      dateOfBirth: "",
      age: "",
      phone: "",
      email: "",
      address: "",
      heightCm: "",
      weightKg: "",
    },
  });

  useEffect(() => {
    if (!patient) return;
    form.reset({
      firstName: patient.firstName,
      middleName: patient.middleName ?? "",
      lastName: patient.lastName,
      gender: genderToCode[patient.gender] ?? "OTHER",
      dateOfBirth: patient.dateOfBirth ?? "",
      age: String(patient.age),
      phone: patient.phone,
      email: patient.email ?? "",
      address: patient.address ?? "",
      heightCm:
        typeof patient.heightCm === "number" ? String(patient.heightCm) : "",
      weightKg:
        typeof patient.weightKg === "number" ? String(patient.weightKg) : "",
    });
  }, [patient, form]);

  const dob = form.watch("dateOfBirth");
  useEffect(() => {
    if (dob) {
      form.setValue("age", calculateAge(dob), { shouldValidate: true });
    }
  }, [dob, form]);

  const firstName = form.watch("firstName");
  const lastName = form.watch("lastName");
  const phone = form.watch("phone");
  const match = findDuplicates(
    { firstName, lastName, phone, dateOfBirth: dob },
    id,
  );
  const strictMatch = match.strict[0];
  const nameDobMatch = match.nameDob[0];
  const sharedPhoneMatch = match.sharedPhone[0];
  const anyMatch = strictMatch ?? nameDobMatch ?? sharedPhoneMatch;

  useEffect(() => {
    if (!anyMatch) setConfirmSharedPhone(false);
  }, [anyMatch]);

  const isDirty = form.formState.isDirty;
  useUnsavedChangesWarning(isDirty);

  if (!patient) {
    return (
      <div className="mx-auto max-w-400">
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="mb-2 text-lg font-semibold">Patient not found</p>
          <p className="text-muted-foreground mb-6 text-sm">
            No patient with id <span className="font-mono">{id}</span> exists.
          </p>
          <Link
            href="/patients"
            className="text-brand-600 hover:text-brand-700 text-sm font-medium hover:underline"
          >
            ← Back to patients
          </Link>
        </div>
      </div>
    );
  }

  function onSubmit(values: PatientFormValues) {
    try {
      const heightStr = (values.heightCm ?? "").trim();
      const weightStr = (values.weightKg ?? "").trim();
      const updated = updatePatient(
        id,
        {
          firstName: values.firstName.trim(),
          middleName: values.middleName?.trim() || undefined,
          lastName: values.lastName.trim(),
          gender: genderToLabel[values.gender],
          dateOfBirth: values.dateOfBirth || undefined,
          age: values.dateOfBirth
            ? Number(calculateAge(values.dateOfBirth) || 0)
            : Number(values.age || 0),
          phone: values.phone.trim(),
          email: values.email?.trim() || undefined,
          address: values.address?.trim() || undefined,
          heightCm: heightStr === "" ? undefined : Number(heightStr),
          weightKg: weightStr === "" ? undefined : Number(weightStr),
        },
        { allowOverride: confirmSharedPhone },
      );
      toast.success(`Saved ${updated.firstName} ${updated.lastName}`, {
        description: `${updated.patientCode} · updated just now`,
      });
      router.push("/patients");
    } catch (err) {
      if (err instanceof DuplicatePatientError) {
        const existing = err.existing;
        form.setError("phone", {
          type: "duplicate",
          message: `Already registered as ${existing.patientCode} — ${existing.firstName} ${existing.lastName}`,
        });
        toast.error("Patient already exists", {
          description: `${existing.patientCode} — ${existing.firstName} ${existing.lastName} (${existing.phone}).`,
        });
        return;
      }
      throw err;
    }
  }

  const matchedPatient = anyMatch;
  const matchSeverity: "strict" | "nameDob" | "shared" | null = strictMatch
    ? "strict"
    : nameDobMatch
      ? "nameDob"
      : sharedPhoneMatch
        ? "shared"
        : null;
  const matchList: Patient[] =
    matchSeverity === "strict"
      ? match.strict
      : matchSeverity === "nameDob"
        ? match.nameDob
        : matchSeverity === "shared"
          ? match.sharedPhone
          : [];
  const matchHeaderLabel =
    matchSeverity === "strict"
      ? `Likely duplicate${matchList.length > 1 ? ` (${matchList.length})` : ""}`
      : matchSeverity === "nameDob"
        ? `Possible duplicate${matchList.length > 1 ? ` (${matchList.length})` : ""}`
        : matchSeverity === "shared"
          ? `Phone in use${matchList.length > 1 ? ` (${matchList.length})` : ""}`
          : "";

  return (
    <div className="mx-auto max-w-400">
      <div className="mb-6">
        <Link
          href="/patients"
          onClick={(e) => {
            if (!confirmDiscard(isDirty)) e.preventDefault();
          }}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patients
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Edit Patient
          </h1>
          <span className="bg-brand-50 text-brand-700 ring-brand-100 inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-inset">
            {patient.patientCode}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Registered by{" "}
          <span className="text-neutral-700">
            {patient.createdBy.userName}
          </span>{" "}
          on {formatStamp(patient.createdAt)}
          {patient.updatedAt !== patient.createdAt && (
            <>
              {" "}
              · Last updated by{" "}
              <span className="text-neutral-700">
                {patient.updatedBy.userName}
              </span>{" "}
              on {formatStamp(patient.updatedAt)}
            </>
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-6">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              <section className="space-y-5">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Personal information
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="First name"
                        required
                        error={fieldState.error?.message}
                        {...field}
                        onBlur={(e) => {
                          const formatted = toTitleCase(e.target.value);
                          if (formatted !== e.target.value) {
                            field.onChange(formatted);
                          }
                          field.onBlur();
                        }}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="middleName"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Middle name"
                        error={fieldState.error?.message}
                        {...field}
                        onBlur={(e) => {
                          const formatted = toTitleCase(e.target.value);
                          if (formatted !== e.target.value) {
                            field.onChange(formatted);
                          }
                          field.onBlur();
                        }}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Last name"
                        required
                        error={fieldState.error?.message}
                        {...field}
                        onBlur={(e) => {
                          const formatted = toTitleCase(e.target.value);
                          if (formatted !== e.target.value) {
                            field.onChange(formatted);
                          }
                          field.onBlur();
                        }}
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field, fieldState }) => (
                      <OutlinedSelect
                        label="Gender"
                        required
                        options={genderOptions}
                        value={field.value}
                        onValueChange={(v) => field.onChange(v ?? "")}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Date of birth"
                        type="date"
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field, fieldState }) => (
                      <OutlinedInput
                        label="Age"
                        type="number"
                        min={0}
                        max={149}
                        disabled={Boolean(dob)}
                        helperText={
                          dob
                            ? "Auto-calculated from date of birth"
                            : "Enter if date of birth unknown"
                        }
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                </div>
              </section>

              <section className="space-y-5">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Contact
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field, fieldState }) => (
                      <OutlinedPhoneInput
                        label="Phone"
                        required
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        error={
                          fieldState.error?.message ??
                          (strictMatch
                            ? `Already registered as ${strictMatch.patientCode} — ${strictMatch.firstName} ${strictMatch.lastName}`
                            : sharedPhoneMatch
                              ? `Phone in use by ${sharedPhoneMatch.patientCode} — ${sharedPhoneMatch.firstName} ${sharedPhoneMatch.lastName}`
                              : undefined)
                        }
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                      <OutlinedEmailInput
                        label="Email"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field, fieldState }) => (
                    <OutlinedTextarea
                      label="Address"
                      rows={3}
                      error={fieldState.error?.message}
                      {...field}
                    />
                  )}
                />
              </section>

              <section className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    Vitals
                  </h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Latest height and weight on file. Refreshed at each
                    visit&rsquo;s check-in.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </section>

              {anyMatch && (
                <div
                  className={cn(
                    "flex gap-3 rounded-lg border p-4",
                    matchSeverity === "strict"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-amber-200 bg-amber-50",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      matchSeverity === "strict"
                        ? "text-destructive"
                        : "text-amber-600",
                    )}
                  />
                  <div className="flex-1 space-y-2 text-sm">
                    <p
                      className={cn(
                        "font-medium",
                        matchSeverity === "strict"
                          ? "text-destructive"
                          : "text-amber-900",
                      )}
                    >
                      {matchHeaderLabel} — matches{" "}
                      <span className="font-semibold">
                        {anyMatch.patientCode} — {anyMatch.firstName}{" "}
                        {anyMatch.lastName}
                      </span>
                    </p>
                    <label
                      className={cn(
                        "mt-1 flex items-center gap-2",
                        matchSeverity === "strict"
                          ? "text-destructive"
                          : "text-amber-900",
                      )}
                    >
                      <Checkbox
                        checked={confirmSharedPhone}
                        onCheckedChange={(v) =>
                          setConfirmSharedPhone(Boolean(v))
                        }
                      />
                      <span className="text-sm">
                        Yes, this is intentional — save anyway
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="-mx-6 -mb-6 flex items-center justify-end gap-3 border-t bg-neutral-50/60 px-6 py-4">
                <Button
                  variant="outline"
                  type="button"
                  className="h-10 px-4"
                  onClick={() => {
                    if (confirmDiscard(isDirty)) router.push("/patients");
                  }}
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={
                    form.formState.isSubmitting ||
                    !form.formState.isDirty ||
                    (Boolean(anyMatch) && !confirmSharedPhone)
                  }
                  className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {form.formState.isSubmitting
                      ? "Saving..."
                      : "Save Changes"}
                  </span>
                </button>
              </div>
            </form>
          </Form>
          </div>
        </div>

        {matchedPatient && (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div
              className={cn(
                "overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm",
                matchSeverity === "strict"
                  ? "border-destructive/30"
                  : "border-amber-300",
              )}
            >
              <div
                className={cn(
                  "px-4 py-2 text-xs font-semibold tracking-wide uppercase",
                  matchSeverity === "strict"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-100 text-amber-900",
                )}
              >
                {matchHeaderLabel}
              </div>
              <div className="divide-y">
                {matchList.map((p) => (
                  <div key={p.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-muted-foreground font-mono text-xs">
                          {p.patientCode}
                        </div>
                        <div className="text-sm font-semibold">
                          {p.firstName}{" "}
                          {p.middleName ? `${p.middleName} ` : ""}
                          {p.lastName}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {p.gender} · {p.age} yrs
                        </div>
                      </div>
                      <Link
                        href={`/patients/${p.id}`}
                        className="text-brand-600 hover:text-brand-700 shrink-0 text-xs font-medium hover:underline"
                      >
                        View →
                      </Link>
                    </div>

                    <dl className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd className="font-mono">{p.phone}</dd>
                      </div>
                      {p.email && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Email</dt>
                          <dd className="truncate">{p.email}</dd>
                        </div>
                      )}
                      {p.dateOfBirth && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">DOB</dt>
                          <dd>{formatDateOnly(p.dateOfBirth)}</dd>
                        </div>
                      )}
                      {p.address && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground shrink-0">
                            Address
                          </dt>
                          <dd className="text-right whitespace-pre-line">
                            {p.address}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <div className="text-[11px] text-neutral-500">
                      Registered by{" "}
                      <span className="text-neutral-700">
                        {p.createdBy.userName}
                      </span>{" "}
                      on {formatStamp(p.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
