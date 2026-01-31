/**
 * Grounded answer evaluation runner
 *
 * Evaluates answer generation quality on a sample of dev questions
 */
import type { ParsedQA } from "@pkg/shared";
import type { TypedSupabaseClient } from "@pkg/db";
import { searchSections, type SearchResult } from "@pkg/retrieval";
import {
  generateAnswer,
  type GeneratedAnswer,
} from "@pkg/agent";

export interface GroundedEvalOptions {
  /** Top-k for retrieval */
  topK?: number;
  /** Number of questions to evaluate */
  sampleSize?: number;
  /** Random seed for reproducible sampling */
  seed?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

export interface GroundedEvalDetail {
  queryId: string;
  question: string;
  goldTechnoteId: string | null;
  retrievedSectionIds: string[];
  answer: string;
  citationCount: number;
  validCitations: string[];
  invalidCitations: string[];
  isAbstention: boolean;
  hasValidCitation: boolean;
  allCitationsValid: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GroundedEvalReport {
  /** Timestamp of evaluation */
  timestamp: string;
  /** Options used */
  options: {
    topK: number;
    sampleSize: number;
    seed: number | null;
  };
  /** Aggregate metrics */
  aggregate: {
    totalQuestions: number;
    questionsWithCitations: number;
    questionsWithValidCitations: number;
    questionsWithAllValidCitations: number;
    abstentions: number;
    invalidCitationCount: number;
    /** Rate of questions with at least one valid citation */
    validCitationRate: number;
    /** Rate of questions where all citations are valid */
    allCitationsValidRate: number;
    /** Rate of abstention (model refused to answer) */
    abstentionRate: number;
    /** Total tokens used */
    totalTokens: number;
  };
  /** Per-question details */
  details: GroundedEvalDetail[];
}

const defaultOptions = {
  topK: 5,
  sampleSize: 25,
  seed: null as number | null,
};

/**
 * Simple seeded random for reproducible sampling
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Sample n items from array with optional seed
 */
function sampleArray<T>(array: T[], n: number, seed?: number): T[] {
  if (n >= array.length) return [...array];

  const copy = [...array];
  const random = seed !== undefined ? seededRandom(seed) : Math.random;

  // Fisher-Yates shuffle partial
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy.slice(0, n);
}

/**
 * Run grounded answer evaluation on a sample of dev questions
 */
export async function runGroundedEval(
  supabase: TypedSupabaseClient,
  devQuestions: ParsedQA[],
  options: GroundedEvalOptions = {}
): Promise<GroundedEvalReport> {
  const topK = options.topK ?? defaultOptions.topK;
  const sampleSize = options.sampleSize ?? defaultOptions.sampleSize;
  const seed = options.seed ?? defaultOptions.seed;
  const { onProgress } = options;

  // Sample questions
  const sample = sampleArray(
    devQuestions,
    sampleSize,
    seed ?? undefined
  );

  const details: GroundedEvalDetail[] = [];

  // Process each question
  let processed = 0;
  for (const qa of sample) {
    processed++;
    onProgress?.(processed, sample.length);

    // Retrieve sections
    const sections = await searchSections(supabase, qa.question, { topK });

    // Generate answer
    const result = await generateAnswer(qa.question, sections);

    details.push({
      queryId: qa.id,
      question: qa.question,
      goldTechnoteId: qa.goldTechnoteId,
      retrievedSectionIds: sections.map((s) => s.id),
      answer: result.answer,
      citationCount: result.citationValidation.citationCount,
      validCitations: result.citationValidation.validCitations,
      invalidCitations: result.citationValidation.invalidCitations,
      isAbstention: result.citationValidation.isAbstention,
      hasValidCitation: result.citationValidation.validCitations.length > 0,
      allCitationsValid: result.citationValidation.isValid,
      usage: result.usage,
    });
  }

  // Compute aggregate metrics
  const totalQuestions = details.length;
  const questionsWithCitations = details.filter((d) => d.citationCount > 0).length;
  const questionsWithValidCitations = details.filter((d) => d.hasValidCitation).length;
  const questionsWithAllValidCitations = details.filter(
    (d) => d.citationCount > 0 && d.allCitationsValid
  ).length;
  const abstentions = details.filter((d) => d.isAbstention).length;
  const invalidCitationCount = details.reduce(
    (sum, d) => sum + d.invalidCitations.length,
    0
  );
  const totalTokens = details.reduce((sum, d) => sum + d.usage.totalTokens, 0);

  return {
    timestamp: new Date().toISOString(),
    options: {
      topK,
      sampleSize,
      seed,
    },
    aggregate: {
      totalQuestions,
      questionsWithCitations,
      questionsWithValidCitations,
      questionsWithAllValidCitations,
      abstentions,
      invalidCitationCount,
      validCitationRate: questionsWithValidCitations / totalQuestions,
      allCitationsValidRate:
        questionsWithCitations > 0
          ? questionsWithAllValidCitations / questionsWithCitations
          : 1,
      abstentionRate: abstentions / totalQuestions,
      totalTokens,
    },
    details,
  };
}

/**
 * Format grounded eval report as summary string
 */
export function formatGroundedSummary(report: GroundedEvalReport): string {
  const { aggregate: agg } = report;

  const lines = [
    "=== Grounded Answer Evaluation Summary ===",
    "",
    `Total Questions:              ${agg.totalQuestions}`,
    `Questions with Citations:     ${agg.questionsWithCitations}`,
    `Questions with Valid Citation: ${agg.questionsWithValidCitations}`,
    `All Citations Valid:          ${agg.questionsWithAllValidCitations}`,
    `Abstentions:                  ${agg.abstentions}`,
    "",
    `Valid Citation Rate:          ${(agg.validCitationRate * 100).toFixed(1)}%`,
    `All-Valid Rate:               ${(agg.allCitationsValidRate * 100).toFixed(1)}%`,
    `Abstention Rate:              ${(agg.abstentionRate * 100).toFixed(1)}%`,
    "",
    `Invalid Citations:            ${agg.invalidCitationCount}`,
    `Total Tokens Used:            ${agg.totalTokens}`,
  ];

  return lines.join("\n");
}

/**
 * Format report as CSV
 */
export function formatGroundedAsCSV(report: GroundedEvalReport): string {
  const headers = [
    "query_id",
    "gold_technote_id",
    "citation_count",
    "valid_citations",
    "invalid_citations",
    "is_abstention",
    "has_valid_citation",
    "all_citations_valid",
    "tokens",
    "question_preview",
    "answer_preview",
  ];

  const rows = report.details.map((d) => [
    d.queryId,
    d.goldTechnoteId ?? "",
    d.citationCount.toString(),
    d.validCitations.join(";"),
    d.invalidCitations.join(";"),
    d.isAbstention ? "1" : "0",
    d.hasValidCitation ? "1" : "0",
    d.allCitationsValid ? "1" : "0",
    d.usage.totalTokens.toString(),
    `"${d.question.slice(0, 80).replace(/"/g, '""')}"`,
    `"${d.answer.slice(0, 100).replace(/"/g, '""').replace(/\n/g, " ")}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
