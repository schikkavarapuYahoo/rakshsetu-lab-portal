import { z } from "zod";

const NAME_REGEX = /^[\p{L}\s'-]+$/u;
const PHONE_CHARS_REGEX = /^[+\d\s-]+$/;
const EARLIEST_DOB = new Date("1900-01-01");

const nameField = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(50, `${label} is too long`)
    .regex(
      NAME_REGEX,
      `${label} can only contain letters, spaces, hyphens, and apostrophes`,
    );

const optionalNameField = (label: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || v.length <= 50, { message: `${label} is too long` })
    .refine((v) => !v || NAME_REGEX.test(v), {
      message: `${label} can only contain letters, spaces, hyphens, and apostrophes`,
    });

export const patientSchema = z.object({
  firstName: nameField("First name"),
  middleName: optionalNameField("Middle name"),
  lastName: nameField("Last name"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"], { message: "Select a gender" }),
  dateOfBirth: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), {
      message: "Invalid date",
    })
    .refine((v) => !v || new Date(v) <= new Date(), {
      message: "Date of birth cannot be in the future",
    })
    .refine((v) => !v || new Date(v) >= EARLIEST_DOB, {
      message: "Date of birth must be after 1900",
    }),
  age: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) < 150),
      { message: "Enter a valid age (1–149)" },
    ),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(PHONE_CHARS_REGEX, "Only digits, spaces, +, and -")
    .refine((v) => v.replace(/\D/g, "").length >= 10, {
      message: "Must contain at least 10 digits",
    })
    .refine((v) => v.replace(/\D/g, "").length <= 15, {
      message: "Too many digits",
    }),
  email: z
    .union([z.literal(""), z.string().email("Enter a valid email")])
    .optional(),
  address: z
    .string()
    .max(500, "Address is too long (max 500 chars)")
    .optional(),
  // Vitals captured at check-in. Strings on the form side; parsed to
  // numbers inside the store. Empty is OK (truly unknown — better than
  // forcing a guess that gets used for dose calculations later).
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
      { message: "Weight must be 0.5–635 kg" },
    ),
});

export type PatientFormValues = z.infer<typeof patientSchema>;
