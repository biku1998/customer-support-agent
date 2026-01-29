/**
 * ID generation utilities for stable, deterministic IDs
 */

/** Create a stable section ID from technote ID and section index */
export function createSectionId(technoteId: string, sectionIdx: number): string {
  return `${technoteId}#${sectionIdx}`;
}

/** Parse a section ID back into its components */
export function parseSectionId(sectionId: string): {
  technoteId: string;
  sectionIdx: number;
} | null {
  const parts = sectionId.split("#");
  if (parts.length !== 2) return null;

  const technoteId = parts[0];
  const sectionIdx = parseInt(parts[1] ?? "", 10);

  if (!technoteId || isNaN(sectionIdx)) return null;

  return { technoteId, sectionIdx };
}

/** Extract technote ID from a section ID */
export function getTechnoteIdFromSectionId(sectionId: string): string | null {
  const parsed = parseSectionId(sectionId);
  return parsed?.technoteId ?? null;
}
