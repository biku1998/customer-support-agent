/**
 * Regression test runner
 *
 * Runs evaluation on a fixed golden set of questions and compares
 * against quality thresholds for pass/fail determination.
 */
import type { ParsedQA } from "@pkg/shared";
import type { TypedSupabaseClient } from "@pkg/db";
import { searchSections, type SearchResult } from "@pkg/retrieval";
import { generateAnswer, type GeneratedAnswer } from "@pkg/agent";
import {
  computeAggregateMetrics,
  type RetrievalResult,
  type AggregateMetrics,
} from "../metrics/retrieval.js";

/**
 * Quality thresholds for pass/fail determination
 */
export interface QualityThresholds {
  /** Minimum Recall@k (0-1) */
  minRecallAtK: number;
  /** Minimum citation validity rate (0-1) */
  minCitationValidityRate: number;
  /** Maximum abstention rate (0-1) - abstaining too much is a problem */
  maxAbstentionRate: number;
}

/**
 * Default thresholds based on Phase 6 results
 */
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minRecallAtK: 0.5, // 50% of answerable questions should have gold in top-k
  minCitationValidityRate: 0.9, // 90% of citations should be valid
  maxAbstentionRate: 0.98, // Allow up to 98% abstention (current is ~96%)
};

export interface RegressionOptions {
  /** Top-k for retrieval */
  topK?: number;
  /** Quality thresholds */
  thresholds?: Partial<QualityThresholds>;
  /** Progress callback */
  onProgress?: (current: number, total: number, phase: string) => void;
}

export interface RegressionDetail {
  queryId: string;
  question: string;
  answerable: boolean;
  goldTechnoteId: string | null;
  // Retrieval results
  retrievedTechnoteIds: string[];
  retrievalHit: boolean;
  reciprocalRank: number;
  // Generation results
  answer: string;
  citationCount: number;
  validCitations: string[];
  invalidCitations: string[];
  isAbstention: boolean;
  hasValidCitation: boolean;
  allCitationsValid: boolean;
  tokens: number;
}

export interface RegressionMetrics {
  // Retrieval metrics
  totalQuestions: number;
  answerableQuestions: number;
  unanswerableQuestions: number;
  recallAtK: number;
  mrr: number;
  retrievalHits: number;
  retrievalMisses: number;
  // Generation metrics
  questionsWithCitations: number;
  questionsWithValidCitations: number;
  questionsWithAllValidCitations: number;
  abstentions: number;
  invalidCitationCount: number;
  citationValidityRate: number;
  allCitationsValidRate: number;
  abstentionRate: number;
  totalTokens: number;
}

export interface ThresholdResult {
  name: string;
  threshold: number;
  actual: number;
  passed: boolean;
  comparison: "min" | "max";
}

export interface RegressionReport {
  timestamp: string;
  options: {
    topK: number;
    goldenSetSize: number;
  };
  thresholds: QualityThresholds;
  metrics: RegressionMetrics;
  thresholdResults: ThresholdResult[];
  passed: boolean;
  details: RegressionDetail[];
}

const defaultOptions = {
  topK: 5,
};

/**
 * Run regression evaluation on golden set
 */
export async function runRegression(
  supabase: TypedSupabaseClient,
  goldenQuestions: ParsedQA[],
  options: RegressionOptions = {}
): Promise<RegressionReport> {
  const topK = options.topK ?? defaultOptions.topK;
  const thresholds: QualityThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options.thresholds,
  };
  const { onProgress } = options;

  const details: RegressionDetail[] = [];
  const retrievalResults: RetrievalResult[] = [];

  // Process each question
  let processed = 0;
  const total = goldenQuestions.length;

  for (const qa of goldenQuestions) {
    processed++;
    onProgress?.(processed, total, "evaluating");

    // Step 1: Retrieve sections
    const sections = await searchSections(supabase, qa.question, { topK });

    // Extract unique technote IDs in order
    const seenTechnotes = new Set<string>();
    const technoteIds: string[] = [];
    for (const s of sections) {
      if (!seenTechnotes.has(s.technoteId)) {
        seenTechnotes.add(s.technoteId);
        technoteIds.push(s.technoteId);
      }
    }

    // Compute retrieval metrics for this query
    const retrievalResult: RetrievalResult = {
      queryId: qa.id,
      retrievedTechnoteIds: technoteIds,
      goldTechnoteId: qa.goldTechnoteId,
    };
    retrievalResults.push(retrievalResult);

    const { perQuery } = computeAggregateMetrics([retrievalResult], topK);
    const queryMetrics = perQuery[0]!;

    // Step 2: Generate answer
    const genResult = await generateAnswer(qa.question, sections);

    details.push({
      queryId: qa.id,
      question: qa.question,
      answerable: qa.answerable,
      goldTechnoteId: qa.goldTechnoteId,
      retrievedTechnoteIds: technoteIds,
      retrievalHit: queryMetrics.hit,
      reciprocalRank: queryMetrics.reciprocalRank,
      answer: genResult.answer,
      citationCount: genResult.citationValidation.citationCount,
      validCitations: genResult.citationValidation.validCitations,
      invalidCitations: genResult.citationValidation.invalidCitations,
      isAbstention: genResult.citationValidation.isAbstention,
      hasValidCitation: genResult.citationValidation.validCitations.length > 0,
      allCitationsValid: genResult.citationValidation.isValid,
      tokens: genResult.usage.totalTokens,
    });
  }

  // Compute aggregate retrieval metrics
  const { aggregate: retrievalAgg } = computeAggregateMetrics(
    retrievalResults,
    topK
  );

  // Compute aggregate generation metrics
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
  const totalTokens = details.reduce((sum, d) => sum + d.tokens, 0);

  const metrics: RegressionMetrics = {
    // Retrieval
    totalQuestions: retrievalAgg.totalQuestions,
    answerableQuestions: retrievalAgg.answerableQuestions,
    unanswerableQuestions: retrievalAgg.unanswerableQuestions,
    recallAtK: retrievalAgg.recallAtK,
    mrr: retrievalAgg.mrr,
    retrievalHits: retrievalAgg.hits,
    retrievalMisses: retrievalAgg.misses,
    // Generation
    questionsWithCitations,
    questionsWithValidCitations,
    questionsWithAllValidCitations,
    abstentions,
    invalidCitationCount,
    citationValidityRate:
      questionsWithCitations > 0
        ? questionsWithAllValidCitations / questionsWithCitations
        : 1,
    allCitationsValidRate:
      questionsWithCitations > 0
        ? questionsWithAllValidCitations / questionsWithCitations
        : 1,
    abstentionRate: abstentions / totalQuestions,
    totalTokens,
  };

  // Evaluate thresholds
  const thresholdResults: ThresholdResult[] = [
    {
      name: "Recall@K",
      threshold: thresholds.minRecallAtK,
      actual: metrics.recallAtK,
      passed: metrics.recallAtK >= thresholds.minRecallAtK,
      comparison: "min",
    },
    {
      name: "Citation Validity Rate",
      threshold: thresholds.minCitationValidityRate,
      actual: metrics.citationValidityRate,
      passed: metrics.citationValidityRate >= thresholds.minCitationValidityRate,
      comparison: "min",
    },
    {
      name: "Abstention Rate",
      threshold: thresholds.maxAbstentionRate,
      actual: metrics.abstentionRate,
      passed: metrics.abstentionRate <= thresholds.maxAbstentionRate,
      comparison: "max",
    },
  ];

  const passed = thresholdResults.every((t) => t.passed);

  return {
    timestamp: new Date().toISOString(),
    options: {
      topK,
      goldenSetSize: goldenQuestions.length,
    },
    thresholds,
    metrics,
    thresholdResults,
    passed,
    details,
  };
}

/**
 * Format regression report as summary string
 */
export function formatRegressionSummary(report: RegressionReport): string {
  const { metrics: m, thresholdResults, passed } = report;

  const lines = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║              REGRESSION TEST REPORT                          ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `Status: ${passed ? "✓ PASSED" : "✗ FAILED"}`,
    "",
    "─── Retrieval Metrics ───",
    `  Total Questions:      ${m.totalQuestions}`,
    `  Answerable:           ${m.answerableQuestions}`,
    `  Unanswerable:         ${m.unanswerableQuestions}`,
    `  Recall@${report.options.topK}:            ${(m.recallAtK * 100).toFixed(1)}%`,
    `  MRR:                  ${m.mrr.toFixed(4)}`,
    `  Hits/Misses:          ${m.retrievalHits}/${m.retrievalMisses}`,
    "",
    "─── Generation Metrics ───",
    `  With Citations:       ${m.questionsWithCitations}`,
    `  Valid Citations:      ${m.questionsWithValidCitations}`,
    `  All Valid:            ${m.questionsWithAllValidCitations}`,
    `  Abstentions:          ${m.abstentions}`,
    `  Invalid Citations:    ${m.invalidCitationCount}`,
    `  Citation Validity:    ${(m.citationValidityRate * 100).toFixed(1)}%`,
    `  Abstention Rate:      ${(m.abstentionRate * 100).toFixed(1)}%`,
    `  Total Tokens:         ${m.totalTokens}`,
    "",
    "─── Threshold Checks ───",
  ];

  for (const t of thresholdResults) {
    const op = t.comparison === "min" ? "≥" : "≤";
    const icon = t.passed ? "✓" : "✗";
    const pct = (v: number) => (v * 100).toFixed(1) + "%";
    lines.push(
      `  ${icon} ${t.name}: ${pct(t.actual)} ${op} ${pct(t.threshold)}`
    );
  }

  return lines.join("\n");
}

/**
 * Format regression report as CSV
 */
export function formatRegressionAsCSV(report: RegressionReport): string {
  const headers = [
    "query_id",
    "answerable",
    "gold_technote_id",
    "retrieval_hit",
    "reciprocal_rank",
    "citation_count",
    "valid_citations",
    "invalid_citations",
    "is_abstention",
    "all_citations_valid",
    "tokens",
    "question_preview",
    "answer_preview",
  ];

  const rows = report.details.map((d) => [
    d.queryId,
    d.answerable ? "1" : "0",
    d.goldTechnoteId ?? "",
    d.retrievalHit ? "1" : "0",
    d.reciprocalRank.toFixed(4),
    d.citationCount.toString(),
    d.validCitations.join(";"),
    d.invalidCitations.join(";"),
    d.isAbstention ? "1" : "0",
    d.allCitationsValid ? "1" : "0",
    d.tokens.toString(),
    `"${d.question.slice(0, 80).replace(/"/g, '""')}"`,
    `"${d.answer.slice(0, 100).replace(/"/g, '""').replace(/\n/g, " ")}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
