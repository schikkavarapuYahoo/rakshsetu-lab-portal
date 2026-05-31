// Re-export shim so ported source code that uses `@/lib/paise`
// resolves to our canonical implementation under `@/lib/utils/paise`.
// All new code should import from the canonical path; this exists
// only to avoid touching every ported API route.

export * from "./utils/paise";
