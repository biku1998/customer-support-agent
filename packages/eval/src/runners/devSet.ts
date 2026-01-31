/**
 * Dev set evaluation runner
 *
 * Runs retrieval evaluation on the TechQA dev set
 */
import type { ParsedQA } from "@pkg/shared";
import type { TypedSupabaseClient } from "@pkg/db";
import { searchSections, type SearchResult } from "@pkg/retrieval";
import {
  computeAggregateMetrics,
  type RetrievalResult,
  type AggregateMetrics,
  type PerQueryMetrics,
} from "../metrics/retrieval.js";

export interface EvalOptions {
  /** Top-k for retrieval */
  topK?: number;
  /** Limit number of questions to evaluate (for testing) */
  limit?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

export interface EvalReport {
  /** Timestamp of evaluation */
  timestamp: string;
  /** Options used */
  options: {
    topK: number;
    limit: number | null;
  };
  /** Aggregate metrics */
  aggregate: AggregateMetrics;
  /** Per-query results with retrieval details */
  details: EvalDetail[];
}

export interface EvalDetail {
  queryId: string;
  question: string;
  goldTechnoteId: string | null;
  retrievedTechnoteIds: string[];
  retrievedSections: {
    id: string;
    technoteId: string;
    heading: string | null;
    similarity: number;
    contentPreview: string;
  }[];
  metrics: PerQueryMetrics;
}

const defaultOptions: Required<Omit<EvalOptions, "onProgress">> = {
  topK: 5,
  limit: Infinity,
};

/**
 * Run retrieval for a single question
 */
async function retrieveForQuestion(
  supabase: TypedSupabaseClient,
  qa: ParsedQA,
  topK: number
): Promise<{ results: SearchResult[]; technoteIds: string[] }> {
  const results = await searchSections(supabase, qa.question, { topK });

  // Extract unique technote IDs in order of first appearance
  const seenTechnotes = new Set<string>();
  const technoteIds: string[] = [];

  for (const result of results) {
    if (!seenTechnotes.has(result.technoteId)) {
      seenTechnotes.add(result.technoteId);
      technoteIds.push(result.technoteId);
    }
  }

  return { results, technoteIds };
}

/**
 * Run evaluation on dev set
 */
export async function runDevSetEval(
  supabase: TypedSupabaseClient,
  devQuestions: ParsedQA[],
  options: EvalOptions = {}
): Promise<EvalReport> {
  const { topK, limit } = { ...defaultOptions, ...options };
  const { onProgress } = options;

  // Apply limit
  const questionsToEval = limit < Infinity
    ? devQuestions.slice(0, limit)
    : devQuestions;

  const retrievalResults: RetrievalResult[] = [];
  const details: EvalDetail[] = [];

  // Run retrieval for each question
  let processed = 0;
  for (const qa of questionsToEval) {
    processed++;
    onProgress?.(processed, questionsToEval.length);

    const { results, technoteIds } = await retrieveForQuestion(
      supabase,
      qa,
      topK
    );

    // Build retrieval result for metrics
    const retrievalResult: RetrievalResult = {
      queryId: qa.id,
      retrievedTechnoteIds: technoteIds,
      goldTechnoteId: qa.goldTechnoteId,
    };
    retrievalResults.push(retrievalResult);

    // Build detail record
    const { perQuery } = computeAggregateMetrics([retrievalResult], topK);
    const perQueryMetrics = perQuery[0]!;

    details.push({
      queryId: qa.id,
      question: qa.question,
      goldTechnoteId: qa.goldTechnoteId,
      retrievedTechnoteIds: technoteIds,
      retrievedSections: results.map((r) => ({
        id: r.id,
        technoteId: r.technoteId,
        heading: r.heading,
        similarity: r.similarity,
        contentPreview: r.content.slice(0, 150) + (r.content.length > 150 ? "..." : ""),
      })),
      metrics: perQueryMetrics,
    });
  }

  // Compute aggregate metrics
  const { aggregate } = computeAggregateMetrics(retrievalResults, topK);

  return {
    timestamp: new Date().toISOString(),
    options: {
      topK,
      limit: limit < Infinity ? limit : null,
    },
    aggregate,
    details,
  };
}

/**
 * Format report as CSV summary (one row per question)
 */
export function formatReportAsCSV(report: EvalReport): string {
  const headers = [
    "query_id",
    "gold_technote_id",
    "hit",
    "rank_of_gold",
    "reciprocal_rank",
    "retrieved_technote_ids",
    "question_preview",
  ];

  const rows = report.details.map((d) => [
    d.queryId,
    d.goldTechnoteId ?? "",
    d.metrics.hit ? "1" : "0",
    d.metrics.rankOfGold?.toString() ?? "",
    d.metrics.reciprocalRank.toFixed(4),
    d.retrievedTechnoteIds.join(";"),
    `"${d.question.slice(0, 100).replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Format aggregate metrics as a summary string
 */
export function formatAggregateSummary(aggregate: AggregateMetrics): string {
  const lines = [
    "=== Retrieval Evaluation Summary ===",
    "",
    `Total Questions:      ${aggregate.totalQuestions}`,
    `Answerable:           ${aggregate.answerableQuestions}`,
    `Unanswerable:         ${aggregate.unanswerableQuestions}`,
    "",
    `Top-K:                ${aggregate.k}`,
    `Recall@${aggregate.k}:            ${(aggregate.recallAtK * 100).toFixed(2)}%`,
    `MRR:                  ${aggregate.mrr.toFixed(4)}`,
    "",
    `Hits:                 ${aggregate.hits}`,
    `Misses:               ${aggregate.misses}`,
  ];

  return lines.join("\n");
}
