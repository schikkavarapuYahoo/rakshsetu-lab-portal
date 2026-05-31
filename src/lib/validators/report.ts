import { z } from "zod";

const dateString = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), {
    message: "Invalid date",
  });

export const resultRowSchema = z.object({
  parameter: z
    .string()
    .min(1, "Parameter is required")
    .max(80, "Parameter is too long"),
  value: z.string().max(80, "Value is too long").optional().default(""),
  unit: z.string().max(20, "Unit is too long").optional(),
  referenceRange: z
    .string()
    .max(40, "Reference range is too long")
    .optional(),
  flag: z.enum(["Low", "Normal", "High", "Critical"]).optional(),
  notes: z.string().max(200, "Notes are too long").optional(),
});

/**
 * One test entry inside a multi-test visit. Each entry becomes its own
 * `Report` row in the store, all sharing the same `visitId`.
 */
export const testEntrySchema = z.object({
  testName: z
    .string()
    .min(2, "Test name is required")
    .max(80, "Test name is too long"),
  testCode: z.string().max(20, "Test code is too long").optional(),
  results: z.array(resultRowSchema).optional().default([]),
});

/**
 * Report creation schema.
 *
 * A single submission represents one patient visit, which may contain
 * multiple tests (CBC + Lipid + Thyroid is a common combo). Each test in
 * `tests` becomes a separate Report row; all rows share the visit metadata
 * (patient, collection date, doctor, notes).
 *
 * Note: there is no `status` field — new reports always enter the workflow
 * at "Sample Collected". Status transitions happen via the dedicated
 * actions in the reports store (startTesting → sendForReview → publish).
 */
export const reportSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  requestingDoctor: z
    .string()
    .max(80, "Doctor name is too long")
    .optional(),
  referringHospital: z
    .string()
    .max(120, "Hospital / clinic name is too long")
    .optional(),
  collectedAt: dateString,
  reportedAt: dateString,
  notes: z.string().max(500, "Notes are too long").optional(),
  // Vitals captured at check-in. Optional — if blank, the patient's
  // last-known values are kept. If filled, the patient record is updated
  // alongside report creation. See `setVitals` in the patients store.
  heightCm: z
    .string()
    .optional()
    .refine(
      (v) =>
        !v ||
        (/^\d+(\.\d+)?$/.test(v) && Number(v) > 30 && Number(v) <= 272),
      { message: "Height must be between 30 and 272 cm" },
    ),
  weightKg: z
    .string()
    .optional()
    .refine(
      (v) =>
        !v ||
        (/^\d+(\.\d+)?$/.test(v) && Number(v) > 0.5 && Number(v) <= 635),
      { message: "Weight must be between 0.5 and 635 kg" },
    ),
  // Visit-level check-in vitals. Snapshotted onto each created Report.
  bpSystolic: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) >= 40 && Number(v) <= 300),
      { message: "Systolic BP must be 40–300 mmHg" },
    ),
  bpDiastolic: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) >= 20 && Number(v) <= 200),
      { message: "Diastolic BP must be 20–200 mmHg" },
    ),
  pulseBpm: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) >= 20 && Number(v) <= 250),
      { message: "Pulse must be 20–250 bpm" },
    ),
  temperatureF: z
    .string()
    .optional()
    .refine(
      (v) =>
        !v ||
        (/^\d+(\.\d+)?$/.test(v) && Number(v) >= 86 && Number(v) <= 113),
      { message: "Temperature must be 86–113 °F" },
    ),
  fastingStatus: z
    .enum(["none", "lt4h", "4to8h", "8plus"])
    .optional(),
  symptoms: z.string().max(500, "Keep it under 500 chars").optional(),
  isPregnant: z.enum(["yes", "no", "unknown"]).optional(),
  lmpDate: z
    .string()
    .optional()
    .refine(
      (v) => !v || !Number.isNaN(new Date(v).getTime()),
      { message: "Invalid date" },
    )
    .refine((v) => !v || new Date(v) <= new Date(), {
      message: "LMP cannot be in the future",
    }),
  tests: z
    .array(testEntrySchema)
    .min(1, "Add at least one test for this visit"),
});

// Use `z.input` (not `z.infer`/output) so optional `.default()` fields
// remain optional on the form input side — matches react-hook-form's
// expectation for defaultValues.
export type ReportFormValues = z.input<typeof reportSchema>;
export type TestEntryValues = z.input<typeof testEntrySchema>;
