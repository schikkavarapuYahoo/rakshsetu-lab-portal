"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowLeft,
  Pencil,
  Save,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  type Gender,
  type Patient,
  type UpdatePatientInput,
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

const GENDER_DISPLAY: Record<"MALE" | "FEMALE" | "OTHER", Gender> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};


export default function NewPatientPage() {
  const router = useRouter();
  const addPatient = usePatientsStore((s) => s.addPatient);
  const updatePatient = usePatientsStore((s) => s.updatePatient);
  const findDuplicates = usePatientsStore((s) => s.findDuplicates);
  const [confirmSharedPhone, setConfirmSharedPhone] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<Patient | null>(null);

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
      phone: "+91 ",
      email: "",
      address: "",
      heightCm: "",
      weightKg: "",
    },
  });

  const isDirty = form.formState.isDirty;
  useUnsavedChangesWarning(isDirty);

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
    {
      firstName,
      lastName,
      phone,
      dateOfBirth: dob,
    },
    updateTarget?.id,
  );

  const exactMatch = match.exact[0];
  const strictMatch = match.strict[0];
  const nameDobMatch = match.nameDob[0];
  const sharedPhoneMatch = match.sharedPhone[0];
  const anyMatch =
    exactMatch ?? strictMatch ?? nameDobMatch ?? sharedPhoneMatch;

  useEffect(() => {
    if (!anyMatch) setConfirmSharedPhone(false);
  }, [anyMatch]);

  async function onSubmit(values: PatientFormValues) {
    if (updateTarget) {
      const heightStr = (values.heightCm ?? "").trim();
      const weightStr = (values.weightKg ?? "").trim();
      const changes: UpdatePatientInput = {
        firstName: values.firstName.trim(),
        middleName: values.middleName?.trim() || undefined,
        lastName: values.lastName.trim(),
        gender: GENDER_DISPLAY[values.gender],
        dateOfBirth: values.dateOfBirth || undefined,
        age: values.dateOfBirth
          ? Number(calculateAge(values.dateOfBirth) || 0)
          : Number(values.age || 0),
        phone: values.phone.trim(),
        email: values.email?.trim() || undefined,
        address: values.address?.trim() || undefined,
        heightCm: heightStr === "" ? undefined : Number(heightStr),
        weightKg: weightStr === "" ? undefined : Number(weightStr),
      };
      try {
        const updated = updatePatient(updateTarget.id, changes, {
          allowOverride: confirmSharedPhone,
        });
        toast.success(
          `Updated ${updated.patientCode} — ${updated.firstName} ${updated.lastName}`,
        );
        setUpdateTarget(null);
        router.push("/patients");
      } catch (err) {
        if (err instanceof DuplicatePatientError) {
          toast.error("Cannot update — conflicts with another patient", {
            description: `${err.existing.patientCode} — ${err.existing.firstName} ${err.existing.lastName}`,
          });
          return;
        }
        throw err;
      }
      return;
    }

    try {
      const created = await addPatient(values, {
        allowOverride: confirmSharedPhone,
      });
      toast.success(
        `Patient registered: ${created.firstName} ${created.lastName}`,
        { description: `Assigned Patient ID: ${created.patientCode}` },
      );
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

  function handleOpenUpdate(patient: Patient) {
    setUpdateTarget(patient);
    const genderCode: "MALE" | "FEMALE" | "OTHER" =
      patient.gender === "Male"
        ? "MALE"
        : patient.gender === "Female"
          ? "FEMALE"
          : "OTHER";
    form.reset({
      firstName: patient.firstName,
      middleName: patient.middleName ?? "",
      lastName: patient.lastName,
      gender: genderCode,
      dateOfBirth: patient.dateOfBirth ?? "",
      age: String(patient.age),
      phone: patient.phone,
      email: patient.email ?? "",
      address: patient.address ?? "",
    });
    setConfirmSharedPhone(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleCancelUpdate() {
    setUpdateTarget(null);
    form.reset({
      firstName: "",
      middleName: "",
      lastName: "",
      gender: undefined,
      dateOfBirth: "",
      age: "",
      phone: "+91 ",
      email: "",
      address: "",
    });
    setConfirmSharedPhone(false);
  }

  const matchedPatient = anyMatch;
  const matchSeverity:
    | "exact"
    | "strict"
    | "nameDob"
    | "shared"
    | null = exactMatch
    ? "exact"
    : strictMatch
      ? "strict"
      : nameDobMatch
        ? "nameDob"
        : sharedPhoneMatch
          ? "shared"
          : null;
  const matchList: Patient[] =
    matchSeverity === "exact"
      ? match.exact
      : matchSeverity === "strict"
        ? match.strict
        : matchSeverity === "nameDob"
          ? match.nameDob
          : matchSeverity === "shared"
            ? match.sharedPhone
            : [];
  const matchHeaderLabel =
    matchSeverity === "exact"
      ? "Already registered"
      : matchSeverity === "strict"
        ? `Likely duplicate${matchList.length > 1 ? ` (${matchList.length})` : ""}`
        : matchSeverity === "nameDob"
          ? `Possible duplicate${matchList.length > 1 ? ` (${matchList.length})` : ""}`
          : matchSeverity === "shared"
            ? `Phone in use${matchList.length > 1 ? ` (${matchList.length})` : ""}`
            : "";
  const matchExplanation =
    matchSeverity === "exact"
      ? "This patient already exists — same name, date of birth, and phone. You can only update the existing record."
      : matchSeverity === "strict"
        ? "An existing patient has the same name and phone number."
        : matchSeverity === "nameDob"
          ? "Existing patient(s) have the same name and date of birth. Could be a coincidence."
          : matchSeverity === "shared"
            ? "This phone is registered to another patient — typical for shared family numbers (NRI scenarios)."
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
        <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
          Register New Patient
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A unique Patient ID will be generated automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          {updateTarget && (
            <div className="border-b border-brand-100 bg-brand-50/60 px-6 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Pencil className="text-brand-700 mt-0.5 h-4 w-4 shrink-0" />
                  <div className="text-sm">
                    <div className="text-brand-900 font-medium">
                      Updating{" "}
                      <span className="font-mono">
                        {updateTarget.patientCode}
                      </span>{" "}
                      — {updateTarget.firstName} {updateTarget.lastName}
                    </div>
                    <div className="text-brand-800/80 mt-0.5 text-xs">
                      {isDirty
                        ? "Changes pending — review and click Save Changes."
                        : "No changes made yet. Edit any field, then Save Changes will be enabled."}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelUpdate}
                  className="text-brand-800 hover:bg-brand-100 hover:text-brand-900 h-7 gap-1 px-2"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel update
                </Button>
              </div>
            </div>
          )}
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
                          (exactMatch
                            ? `Already registered as ${exactMatch.patientCode} — ${exactMatch.firstName} ${exactMatch.lastName}`
                            : strictMatch
                              ? `Likely duplicate: ${strictMatch.patientCode} — ${strictMatch.firstName} ${strictMatch.lastName}`
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
                    Optional now &mdash; can be refreshed at every visit
                    check-in.
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

              {matchedPatient && (
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
                        {matchedPatient.patientCode} —{" "}
                        {matchedPatient.firstName} {matchedPatient.lastName}
                      </span>{" "}
                      <Link
                        href={`/patients/${matchedPatient.id}/edit`}
                        onClick={(e) => {
                          if (!confirmDiscard(isDirty)) e.preventDefault();
                        }}
                        className={cn(
                          "ml-1 inline-flex items-center text-xs font-semibold underline-offset-2 hover:underline",
                          matchSeverity === "strict"
                            ? "text-destructive"
                            : "text-amber-900",
                        )}
                      >
                        View →
                      </Link>
                    </p>
                    <p
                      className={
                        matchSeverity === "exact" ||
                        matchSeverity === "strict"
                          ? "text-destructive/90"
                          : "text-amber-800"
                      }
                    >
                      {matchExplanation}
                      {matchSeverity !== "exact" &&
                        " Confirm below if this is genuinely a different person."}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          matchSeverity === "exact" ? "default" : "outline"
                        }
                        onClick={() => handleOpenUpdate(matchedPatient)}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Update existing patient
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        — fix any field (name, phone, email, DOB, address) on{" "}
                        {matchedPatient.patientCode}
                      </span>
                    </div>
                    {matchSeverity !== "exact" && (
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
                          Yes, this is a different patient — register anyway
                        </span>
                      </label>
                    )}
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
                    (updateTarget
                      ? !isDirty
                      : Boolean(exactMatch) ||
                        (Boolean(anyMatch) && !confirmSharedPhone))
                  }
                  title={
                    updateTarget && !isDirty
                      ? "No changes made yet"
                      : undefined
                  }
                  className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateTarget ? (
                    <Save className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  <span>
                    {form.formState.isSubmitting
                      ? "Saving..."
                      : updateTarget
                        ? "Save Changes"
                        : "Create Patient"}
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
                        href={`/patients/${p.id}/edit`}
                        onClick={(e) => {
                          if (!confirmDiscard(isDirty)) e.preventDefault();
                        }}
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
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Reports</dt>
                        <dd>{p.reportCount}</dd>
                      </div>
                    </dl>

                    <div className="text-[11px] text-neutral-500">
                      Registered by{" "}
                      <span className="text-neutral-700">
                        {p.createdBy.userName}
                      </span>{" "}
                      on{" "}
                      {new Date(p.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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

