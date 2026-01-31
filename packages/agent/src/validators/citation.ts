/**
 * Citation validator
 *
 * Validates that all citations in an answer refer to provided context sections
 */

export interface CitationValidationResult {
  /** Whether all citations are valid */
  isValid: boolean;
  /** Number of citations found */
  citationCount: number;
  /** List of valid citation IDs */
  validCitations: string[];
  /** List of invalid citation IDs (not in provided sections) */
  invalidCitations: string[];
  /** Whether the answer indicates abstention (no answer due to insufficient context) */
  isAbstention: boolean;
}

/**
 * Common abstention phrases that indicate the model couldn't answer
 */
const ABSTENTION_PHRASES = [
  "i don't have enough information",
  "i cannot answer",
  "insufficient information",
  "not enough context",
  "no relevant information",
  "cannot be determined",
  "unable to answer",
  "don't have information",
  "no information available",
];

/**
 * Extract all citation IDs from an answer
 * Citations are expected in format [section_id]
 */
export function extractCitations(answer: string): string[] {
  // Match [section_id] patterns
  // Section IDs typically look like: swg24042191#2 or swg21393660#1
  const citationRegex = /\[([^\]]+)\]/g;
  const citations: string[] = [];
  let match;

  while ((match = citationRegex.exec(answer)) !== null) {
    const citation = match[1]!;
    // Filter out common markdown patterns that aren't citations
    if (
      !citation.startsWith("http") &&
      !citation.startsWith("Section ID:") &&
      citation !== "section_id" &&
      citation !== "section1" &&
      citation !== "section2"
    ) {
      citations.push(citation);
    }
  }

  return citations;
}

/**
 * Check if an answer indicates abstention (model refused to answer due to lack of context)
 */
export function detectAbstention(answer: string): boolean {
  const lowerAnswer = answer.toLowerCase();
  return ABSTENTION_PHRASES.some((phrase) => lowerAnswer.includes(phrase));
}

/**
 * Validate citations in an answer against provided section IDs
 */
export function validateCitations(
  answer: string,
  providedSectionIds: string[]
): CitationValidationResult {
  const citations = extractCitations(answer);
  const providedSet = new Set(providedSectionIds);

  const validCitations: string[] = [];
  const invalidCitations: string[] = [];

  for (const citation of citations) {
    if (providedSet.has(citation)) {
      validCitations.push(citation);
    } else {
      invalidCitations.push(citation);
    }
  }

  const isAbstention = detectAbstention(answer);

  return {
    isValid: invalidCitations.length === 0,
    citationCount: citations.length,
    validCitations,
    invalidCitations,
    isAbstention,
  };
}

/**
 * Calculate a lightweight content overlap score
 * Checks if any words from the citation's source appear in the answer near the citation
 *
 * Returns a score between 0 and 1
 */
export function calculateOverlapScore(
  answer: string,
  citation: string,
  sectionContent: string
): number {
  // Find where the citation appears in the answer
  const citationIndex = answer.indexOf(`[${citation}]`);
  if (citationIndex === -1) return 0;

  // Get surrounding text (100 chars before the citation)
  const start = Math.max(0, citationIndex - 200);
  const surroundingText = answer.slice(start, citationIndex).toLowerCase();

  // Extract significant words from the section (5+ chars, not common)
  const commonWords = new Set([
    "the", "and", "that", "this", "with", "from", "have", "been",
    "will", "would", "could", "should", "about", "there", "their",
    "which", "where", "when", "what", "your", "into", "more", "some",
  ]);

  const sectionWords = sectionContent
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !commonWords.has(w))
    .slice(0, 50); // Check first 50 significant words

  if (sectionWords.length === 0) return 1; // No words to check

  // Count how many section words appear in the surrounding answer text
  let matches = 0;
  for (const word of sectionWords) {
    if (surroundingText.includes(word)) {
      matches++;
    }
  }

  return matches / sectionWords.length;
}
