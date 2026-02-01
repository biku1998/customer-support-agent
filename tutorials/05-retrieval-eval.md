# Phase 5 — Retrieval evaluation

**Checkpoint:** Recall@k on dev set; `pnpm --filter @pkg/eval retrieval` produces aggregate metrics and per-question report; you can inspect misses.

**Commit:** `696beee` (eval package: retrieval metrics, dev set runner, eval.ts).

---

## Why

Before investing in answer generation and the agent, we need to **measure retrieval quality** on the dev set:

1. **Recall@k** — For each answerable question, we have a “gold” technote ID (the document that contains the answer). Recall@k answers: “Does the retrieved set (top-k sections) include the gold technote?” We want a high fraction of answerable questions to have the gold doc in the top-k.
2. **MRR (Mean Reciprocal Rank)** — How high is the gold doc in the ranking? MRR = mean of 1/rank of the first gold hit. Higher MRR means the gold doc appears earlier on average.
3. **Per-question details** — So we can inspect “misses” (questions where the gold doc wasn’t in top-k) and debug chunking, embedding, or query formulation.

Running this on the dev set gives a baseline and lets us tune retrieval (top-k, model, chunking) before adding generation.

---

## What you’ll do

- **Metrics** — In `packages/eval/src/metrics/retrieval.ts`, define `RetrievalResult` (queryId, retrievedTechnoteIds, goldTechnoteId), `PerQueryMetrics` (queryId, goldTechnoteId, rankOfGold, hit, reciprocalRank), and `AggregateMetrics` (totalQuestions, answerableQuestions, unanswerableQuestions, k, recallAtK, mrr, hits, misses). Implement `computePerQueryMetrics(result, k)` and `computeAggregateMetrics(results, k)`.
- **Dev set runner** — In `packages/eval/src/runners/devSet.ts`, load dev QA from DATA_DIR, for each question run `searchSections(supabase, qa.question, { topK })`, build `RetrievalResult` (queryId, retrievedTechnoteIds from section results, goldTechnoteId), compute per-query and aggregate metrics, and build a report (timestamp, options, aggregate, details). Optionally format as CSV and write to `eval-reports/`.
- **CLI** — In `packages/eval/bin/eval.ts`, connect to Supabase (with `.env.local`), load dev questions from DATA_DIR (e.g. `raw-data`), run the dev set runner, and write the report (JSON and optionally CSV) to `packages/eval/eval-reports/` with a timestamped filename.

At the end, running `pnpm --filter @pkg/eval retrieval` produces aggregate metrics (Recall@k, MRR, hits/misses) and per-question details so you can inspect misses.

---

## How (step-by-step)

### 1. Eval package setup

- **package.json:** `name: "@pkg/eval"`, dependencies: `@pkg/db`, `@pkg/retrieval`, `@pkg/shared`, and optionally `@pkg/ingest` for loading QA. Scripts: `build`, `typecheck`, `clean`, `retrieval` (e.g. `node --env-file=../../.env.local --import tsx ./bin/eval.ts`).
- **tsconfig.json:** Extend `@pkg/config/tsconfig.base.json`. Include `src` and `bin` as needed.
- **DATA_DIR:** In the bin script, resolve the dev QA path (e.g. `raw-data` at repo root). Use the same path convention as the ingest package (e.g. `loadDevQa(DATA_DIR)`).

---

### 2. Retrieval metrics (`packages/eval/src/metrics/retrieval.ts`)

- **RetrievalResult:** `queryId: string`, `retrievedTechnoteIds: string[]` (unique technote IDs in retrieval order, e.g. from section results), `goldTechnoteId: string | null`.
- **PerQueryMetrics:** `queryId`, `goldTechnoteId`, `rankOfGold: number | null` (1-indexed rank of first gold hit in retrieved list), `hit: boolean` (gold in top-k?), `reciprocalRank: number` (1/rank of first gold, 0 if not found). For unanswerable questions (no gold), set hit=false and reciprocalRank=0.
- **AggregateMetrics:** `totalQuestions`, `answerableQuestions`, `unanswerableQuestions`, `k`, `recallAtK` (hits / answerableQuestions), `mrr` (mean of reciprocalRank over answerable questions), `hits`, `misses`.

**computePerQueryMetrics(result, k):**

- If `goldTechnoteId` is null, return PerQueryMetrics with hit=false, reciprocalRank=0.
- Otherwise, find the index of `goldTechnoteId` in `retrievedTechnoteIds` (or in the first k). Rank = index + 1. Hit = rank <= k. Reciprocal rank = 1/rank if found, else 0. For MRR we use the rank in the **full** retrieved list (not just top-k) so MRR reflects where the gold first appears.

**computeAggregateMetrics(results, k):**

- Map each result to PerQueryMetrics with `computePerQueryMetrics`.
- Filter to answerable (goldTechnoteId !== null). Recall@k = count(hit) / answerable.length. MRR = mean(reciprocalRank) over answerable. Return aggregate + perQuery array.

---

### 3. Dev set runner (`packages/eval/src/runners/devSet.ts`)

- **Input:** Supabase client, dev QA array (ParsedQA[]), options: `topK` (default 5), optional `limit` (for testing), optional `onProgress(current, total)`.
- **For each question:**
  1. Call `searchSections(supabase, qa.question, { topK })`.
  2. Extract **unique technote IDs** in order of first appearance from the section results (so we have a technote-level ranking for Recall@k).
  3. Build `RetrievalResult`: queryId=qa.id, retrievedTechnoteIds, goldTechnoteId=qa.goldTechnoteId.
- **Compute metrics:** Call `computeAggregateMetrics(retrievalResults, topK)` to get aggregate and perQuery.
- **Report:** EvalReport = { timestamp, options: { topK, limit }, aggregate, details }. Each detail can include queryId, question, goldTechnoteId, retrievedTechnoteIds, retrievedSections (id, technoteId, heading, similarity, contentPreview), and the per-query metrics (rankOfGold, hit, reciprocalRank).
- **Output:** Return the report. Optionally add a function to format details as CSV (one row per question with query_id, hit, rank_of_gold, reciprocal_rank, etc.) and write to a file.

---

### 4. CLI (`packages/eval/bin/eval.ts`)

- Load env from `../../.env.local` (via `--env-file` in the script).
- Get Supabase client with `getSupabaseClient()`.
- Load dev QA: `loadDevQa(DATA_DIR)` (DATA_DIR = e.g. `raw-data` at repo root).
- Optional: apply `limit` from args for a quick test.
- Run the dev set runner with the chosen topK.
- Write report JSON to `eval-reports/retrieval-eval-<timestamp>.json`.
- Optionally write CSV to `eval-reports/retrieval-eval-<timestamp>.csv`.
- Print a short summary (Recall@k, MRR, hits, misses).

Example:

```bash
pnpm --filter @pkg/eval retrieval
```

---

## Checkpoint

- `pnpm --filter @pkg/eval retrieval` **produces** a report with aggregate Recall@k and MRR and per-question details.
- You can **inspect misses** (questions where gold wasn’t in top-k) in the details or CSV to debug retrieval.

---

## Commit reference

- `696beee` — feat(eval): add retrieval evaluation package with metrics and dev set runner.

---

## Next

Go to [06-grounded-answers-citations.md](06-grounded-answers-citations.md) to add grounded answer generation and citation validation.
