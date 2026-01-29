/**
 * Types for the TechQA dataset
 * Based on the IBM TechQA dataset format
 */

// ============================================================================
// Raw data types (as they appear in the JSON files)
// ============================================================================

/** Raw Q&A entry from training_Q_A.json or dev_Q_A.json */
export interface RawQAPair {
  QUESTION_ID: string;
  QUESTION_TITLE: string;
  QUESTION_TEXT: string;
  DOCUMENT: string; // "-" if unanswerable
  ANSWER: string; // "-" if unanswerable
  START_OFFSET: string; // "-" if unanswerable
  END_OFFSET: string; // "-" if unanswerable
  ANSWERABLE: "Y" | "N";
  DOC_IDS: string[]; // Candidate document IDs for retrieval
}

/** Raw section within a technote */
export interface RawSection {
  text: string;
  id: string; // Section heading like "PROBLEM(ABSTRACT)" or "NONE"
  start: number;
  end: number;
}

/** Raw technote entry from training_dev_technotes.sections.json */
export interface RawTechnote {
  id: string;
  text: string;
  title: string;
  sections: RawSection[];
}

/** The technotes file is keyed by technote ID */
export type RawTechnotesMap = Record<string, RawTechnote>;

// ============================================================================
// Parsed/normalized types (for use in the application)
// ============================================================================

/** Parsed section with stable composite ID */
export interface ParsedSection {
  /** Stable ID: technoteId#sectionIdx */
  id: string;
  /** Parent technote ID */
  technoteId: string;
  /** Section index (0-based) */
  sectionIdx: number;
  /** Section heading (e.g., "PROBLEM(ABSTRACT)", "SYMPTOM", "NONE") */
  heading: string;
  /** Section content text */
  content: string;
  /** Character offsets in original document */
  span: {
    start: number;
    end: number;
  };
}

/** Parsed technote with flattened sections */
export interface ParsedTechnote {
  /** Technote ID */
  id: string;
  /** Document title */
  title: string;
  /** Full document text */
  fullText: string;
  /** Parsed sections */
  sections: ParsedSection[];
}

/** Parsed QA pair with normalized fields */
export interface ParsedQA {
  /** Question ID */
  id: string;
  /** Question title */
  title: string;
  /** Full question text (title + body) */
  question: string;
  /** Answer text (empty if unanswerable) */
  answer: string;
  /** Whether this question is answerable */
  answerable: boolean;
  /** Gold technote ID for retrieval evaluation (null if unanswerable) */
  goldTechnoteId: string | null;
  /** Answer character offsets in gold document (null if unanswerable) */
  answerSpan: { start: number; end: number } | null;
  /** Candidate document IDs for retrieval */
  candidateDocIds: string[];
}
