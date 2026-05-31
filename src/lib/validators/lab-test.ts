import { z } from "zod";

import {
  SAMPLE_TYPES,
  TUBE_COLORS,
  type SampleType,
  type TestCategory,
  type TubeColor,
} from "@/config/master-tests";

export const TEST_CATEGORIES: TestCategory[] = [
  "Hematology",
  "Biochemistry",
  "Hormone",
  "Vitamin",
  "Urinalysis",
  "Serology",
  "Microbiology",
  "Other",
];

export { SAMPLE_TYPES, TUBE_COLORS };
export type { SampleType, TubeColor };

/** One parameter row inside a lab test definition. */
export const labTestParameterSchema = z.object({
  parameter: z
    .string()
    .min(1, "Parameter name is required")
    .max(80, "Parameter name is too long"),
  unit: z.string().max(20, "Unit is too long").optional(),
  referenceRange: z
    .string()
    .max(60, "Reference range is too long")
    .optional(),
});

const priceStringSchema = z
  .string()
  .optional()
  .refine(
    (v) => {
      if (!v || v.trim() === "") return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0;
    },
    { message: "Price must be a non-negative number" },
  );

const turnaroundStringSchema = z
  .string()
  .min(1, "Turnaround time is required")
  .refine(
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 10080; // up to 1 week
    },
    { message: "Turnaround must be a whole number of minutes (1 – 10,080)" },
  );

export const labTestSchema = z.object({
  name: z
    .string()
    .min(2, "Test name is required")
    .max(80, "Test name is too long"),
  code: z
    .string()
    .min(2, "Test code is required")
    .max(20, "Test code is too long")
    .regex(
      /^[A-Z0-9][A-Z0-9-]*$/i,
      "Use letters, numbers and dashes only (e.g. CBC, TSH-T3-T4)",
    ),
  category: z.enum(TEST_CATEGORIES),
  description: z
    .string()
    .max(300, "Description is too long")
    .optional()
    .default(""),
  basePrice: priceStringSchema,
  turnaroundMinutes: turnaroundStringSchema,
  sampleType: z.enum(SAMPLE_TYPES),
  tubeColor: z.enum(TUBE_COLORS),
  patientPrep: z
    .string()
    .max(300, "Patient prep instructions are too long")
    .optional()
    .default(""),
  parameters: z
    .array(labTestParameterSchema)
    .min(1, "Add at least one parameter"),
});

export type LabTestFormValues = z.input<typeof labTestSchema>;
