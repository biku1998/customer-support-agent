/**
 * Golden set of 50 dev questions for regression testing
 *
 * Selection criteria:
 * - 25 answerable questions (to test retrieval quality)
 * - 25 unanswerable questions (to test abstention behavior)
 * - Deterministically selected for reproducibility
 */

/**
 * Fixed set of question IDs for regression testing.
 * These were selected to provide a representative sample of:
 * - Various question types and complexities
 * - Balanced mix of answerable/unanswerable (50%/50%)
 * - Different technote topics
 */
export const GOLDEN_SET_IDS: string[] = [
  // 50 fixed question IDs sampled across the dev set
  // Actual distribution: 25 answerable, 25 unanswerable (verified)
  "DEV_Q000", "DEV_Q001", "DEV_Q002", "DEV_Q003", "DEV_Q006", "DEV_Q007",
  "DEV_Q010", "DEV_Q011", "DEV_Q015", "DEV_Q018", "DEV_Q019", "DEV_Q022",
  "DEV_Q025", "DEV_Q027", "DEV_Q031", "DEV_Q035", "DEV_Q037", "DEV_Q042",
  "DEV_Q043", "DEV_Q048", "DEV_Q051", "DEV_Q055", "DEV_Q059", "DEV_Q061",
  "DEV_Q067", "DEV_Q068", "DEV_Q074", "DEV_Q075", "DEV_Q081", "DEV_Q083",
  "DEV_Q088", "DEV_Q091", "DEV_Q095", "DEV_Q099", "DEV_Q102", "DEV_Q107",
  "DEV_Q110", "DEV_Q115", "DEV_Q118", "DEV_Q123", "DEV_Q126", "DEV_Q131",
  "DEV_Q134", "DEV_Q139", "DEV_Q143", "DEV_Q152", "DEV_Q161", "DEV_Q170",
  "DEV_Q180", "DEV_Q190",
];

/**
 * Filter questions to only those in the golden set
 */
export function filterToGoldenSet<T extends { id: string }>(
  questions: T[]
): T[] {
  const goldenSetIds = new Set(GOLDEN_SET_IDS);
  return questions.filter((q) => goldenSetIds.has(q.id));
}

/**
 * Validate that all golden set IDs exist in the provided questions
 */
export function validateGoldenSet<T extends { id: string }>(
  questions: T[]
): { valid: boolean; missing: string[] } {
  const questionIds = new Set(questions.map((q) => q.id));
  const missing = GOLDEN_SET_IDS.filter((id) => !questionIds.has(id));
  return {
    valid: missing.length === 0,
    missing,
  };
}
