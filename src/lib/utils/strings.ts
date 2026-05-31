/**
 * Title-cases a name: first letter of each word uppercase, rest lowercase.
 * Handles spaces, hyphens, and apostrophes. Examples:
 *   "siddHartha" -> "Siddhartha"
 *   "anil kumar" -> "Anil Kumar"
 *   "MOHAMMED"   -> "Mohammed"
 *   "d'souza"    -> "D'Souza"
 *   "smith-jones" -> "Smith-Jones"
 */
export function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
