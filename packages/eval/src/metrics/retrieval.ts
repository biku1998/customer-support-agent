/**
 * Retrieval evaluation metrics
 *
 * Implements:
 * - Recall@k: Does the retrieved set include the gold technote ID?
 * - MRR (Mean Reciprocal Rank): 1/rank of first gold hit
 */

export interface RetrievalResult {
  /** Query/question ID */
  queryId: string;
  /** Retrieved technote IDs (in order, most similar first) */
  retrievedTechnoteIds: string[];
  /** Gold technote ID (null if unanswerable) */
  goldTechnoteId: string | null;
}

export interface PerQueryMetrics {
  queryId: string;
  goldTechnoteId: string | null;
  /** Rank of gold doc in retrieved results (1-indexed), null if not found */
  rankOfGold: number | null;
  /** Whether gold doc is in top-k results */
  hit: boolean;
  /** Reciprocal rank (1/rank), 0 if not found */
  reciprocalRank: number;
}

export interface AggregateMetrics {
  /** Total number of questions evaluated */
  totalQuestions: number;
  /** Number of answerable questions (have gold technote) */
  answerableQuestions: number;
  /** Number of unanswerable questions (skipped) */
  unanswerableQuestions: number;
  /** k value used for evaluation */
  k: number;
  /** Recall@k: fraction of answerable questions with gold in top-k */
  recallAtK: number;
  /** Mean Reciprocal Rank across answerable questions */
  mrr: number;
  /** Number of hits (gold found in top-k) */
  hits: number;
  /** Number of misses (gold not found in top-k) */
  misses: number;
}

/**
 * Compute metrics for a single retrieval result
 */
export function computePerQueryMetrics(
  result: RetrievalResult,
  k: number
): PerQueryMetrics {
  const { queryId, retrievedTechnoteIds, goldTechnoteId } = result;

  // If no gold document, this is unanswerable
  if (!goldTechnoteId) {
    return {
      queryId,
      goldTechnoteId: null,
      rankOfGold: null,
      hit: false,
      reciprocalRank: 0,
    };
  }

  // Find rank of gold document (1-indexed)
  const topKResults = retrievedTechnoteIds.slice(0, k);
  const rankIndex = topKResults.findIndex((id) => id === goldTechnoteId);
  const rankOfGold = rankIndex >= 0 ? rankIndex + 1 : null;

  // Also check full results for MRR (might be beyond k)
  const fullRankIndex = retrievedTechnoteIds.findIndex(
    (id) => id === goldTechnoteId
  );
  const fullRank = fullRankIndex >= 0 ? fullRankIndex + 1 : null;

  return {
    queryId,
    goldTechnoteId,
    rankOfGold,
    hit: rankOfGold !== null,
    reciprocalRank: fullRank ? 1 / fullRank : 0,
  };
}

/**
 * Compute aggregate metrics over all retrieval results
 */
export function computeAggregateMetrics(
  results: RetrievalResult[],
  k: number
): { aggregate: AggregateMetrics; perQuery: PerQueryMetrics[] } {
  const perQuery = results.map((r) => computePerQueryMetrics(r, k));

  // Filter to only answerable questions for metrics
  const answerable = perQuery.filter((m) => m.goldTechnoteId !== null);
  const unanswerable = perQuery.filter((m) => m.goldTechnoteId === null);

  const hits = answerable.filter((m) => m.hit).length;
  const misses = answerable.length - hits;

  // Recall@k = hits / answerable
  const recallAtK = answerable.length > 0 ? hits / answerable.length : 0;

  // MRR = mean of reciprocal ranks for answerable questions
  const sumRR = answerable.reduce((sum, m) => sum + m.reciprocalRank, 0);
  const mrr = answerable.length > 0 ? sumRR / answerable.length : 0;

  return {
    aggregate: {
      totalQuestions: results.length,
      answerableQuestions: answerable.length,
      unanswerableQuestions: unanswerable.length,
      k,
      recallAtK,
      mrr,
      hits,
      misses,
    },
    perQuery,
  };
}
