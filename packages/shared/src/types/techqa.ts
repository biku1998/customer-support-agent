/**
 * Types for the TechQA dataset
 * Based on the IBM TechQA dataset format
 */

/** A question-answer pair from training_Q_A.json or dev_Q_A.json */
export interface QAPair {
  /** Unique question ID */
  QUESTION_ID: string;
  /** The question text */
  QUESTION_TITLE: string;
  /** Extended question body (optional) */
  QUESTION_TEXT?: string;
  /** The answer text */
  ANSWER: string;
  /** The ID of the technote that contains the answer */
  DOCUMENT: string;
  /** Start character offset of the answer in the source document */
  START_OFFSET?: number;
  /** End character offset of the answer in the source document */
  END_OFFSET?: number;
}

/** A section within a technote from training_dev_technotes.sections.json */
export interface TechnoteSection {
  /** Technote ID (e.g., "swg12345678") */
  id: string;
  /** Section index within the technote */
  section_idx: number;
  /** Section title/heading */
  title: string;
  /** Section content text */
  text: string;
}

/** A full technote document from training_dev_technotes.json */
export interface Technote {
  /** Technote ID */
  id: string;
  /** Document title */
  title: string;
  /** Full document text */
  text: string;
  /** Product tags/categories */
  product?: string[];
}

/** Parsed section with computed stable ID */
export interface ParsedSection {
  /** Stable ID: technoteId#sectionIdx */
  id: string;
  /** Parent technote ID */
  technoteId: string;
  /** Section index */
  sectionIdx: number;
  /** Section title */
  title: string;
  /** Section content */
  content: string;
}

/** Parsed QA pair with normalized fields */
export interface ParsedQA {
  /** Question ID */
  id: string;
  /** Question text (title + body combined) */
  question: string;
  /** Answer text */
  answer: string;
  /** Gold technote ID for retrieval evaluation */
  goldTechnoteId: string;
  /** Answer offsets in source document (if available) */
  answerSpan?: {
    start: number;
    end: number;
  };
}
