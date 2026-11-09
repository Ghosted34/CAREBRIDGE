/**
 * Remove characters people can't see but browsers and validators can: zero-width spaces/joiners,
 * BOM, soft hyphen, word joiner (often picked up when copying from chat apps or PDFs), plus
 * surrounding whitespace. Use on identifiers like email and phone, never on free text.
 */
export function cleanIdentifier(value: string): string {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '').trim();
}
