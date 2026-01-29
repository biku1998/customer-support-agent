/**
 * Text normalization utilities
 */

/** Normalize whitespace: collapse multiple spaces, trim */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Remove HTML tags from text */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/** Normalize text for comparison: lowercase, normalize whitespace */
export function normalizeForComparison(text: string): string {
  return normalizeWhitespace(text.toLowerCase());
}

/** Truncate text to max length, adding ellipsis if truncated */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
