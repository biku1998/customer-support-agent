/**
 * Loader for TechQA Q&A files (training_Q_A.json, dev_Q_A.json)
 */
import { readFile } from "node:fs/promises";
import type { RawQAPair, ParsedQA } from "@pkg/shared";

/**
 * Parse a raw Q&A entry into a normalized form
 */
function parseQA(raw: RawQAPair): ParsedQA {
  const answerable = raw.ANSWERABLE === "Y";
  const questionBody = raw.QUESTION_TEXT?.trim() ?? "";
  const questionTitle = raw.QUESTION_TITLE.trim();

  // Combine title and body, avoiding duplication if body starts with title
  const question = questionBody.startsWith(questionTitle)
    ? questionBody
    : questionBody
      ? `${questionTitle}\n\n${questionBody}`
      : questionTitle;

  return {
    id: raw.QUESTION_ID,
    title: questionTitle,
    question,
    answer: answerable ? raw.ANSWER : "",
    answerable,
    goldTechnoteId: answerable ? raw.DOCUMENT : null,
    answerSpan: answerable
      ? {
          start: parseInt(raw.START_OFFSET, 10),
          end: parseInt(raw.END_OFFSET, 10),
        }
      : null,
    candidateDocIds: raw.DOC_IDS,
  };
}

/**
 * Load and parse a Q&A JSON file
 */
export async function loadQaFile(filePath: string): Promise<ParsedQA[]> {
  const content = await readFile(filePath, "utf-8");
  const raw: RawQAPair[] = JSON.parse(content);
  return raw.map(parseQA);
}

/**
 * Load training Q&A data
 */
export async function loadTrainingQa(dataDir: string): Promise<ParsedQA[]> {
  return loadQaFile(`${dataDir}/training_Q_A.json`);
}

/**
 * Load dev Q&A data (for evaluation)
 */
export async function loadDevQa(dataDir: string): Promise<ParsedQA[]> {
  return loadQaFile(`${dataDir}/dev_Q_A.json`);
}
