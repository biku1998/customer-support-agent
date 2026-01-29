// Types - raw data formats
export type {
  RawQAPair,
  RawSection,
  RawTechnote,
  RawTechnotesMap,
} from "./types/techqa.js";

// Types - parsed/normalized formats
export type {
  ParsedSection,
  ParsedTechnote,
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
