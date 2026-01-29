// Types
export type {
  QAPair,
  TechnoteSection,
  Technote,
  ParsedSection,
  ParsedQA,
} from "./types/techqa.js";

// Text utilities
export {
  normalizeWhitespace,
  stripHtml,
  normalizeForComparison,
  truncate,
} from "./text/normalize.js";

export {
  createSectionId,
  parseSectionId,
  getTechnoteIdFromSectionId,
} from "./text/ids.js";
