# Phase 8 — Regression suite

**Checkpoint:** Repeatable quality gates; `pnpm --filter @pkg/eval regression` returns pass/fail and a report; you can change prompt/retriever and see metrics move.

**Commit:** `1c7839c` (regression test CLI, golden set, regression runner).

---

## Why

After building retrieval, generation, and the agent, we need **repeatable quality gates** so that:

1. **Changes don’t regress quality** — When we tweak the prompt, retriever, or model, we want to know if Recall@k, citation validity, or abstention behavior got worse.
2. **Fixed golden set** — Evaluating on a **fixed set** of ~50 dev questions (mix of answerable and unanswerable) gives comparable numbers across runs.
3. **Thresholds** — We define minimum/maximum acceptable values (e.g. Recall@5 ≥ 0.5, citation validity rate ≥ 0.9, abstention rate ≤ 0.98) and the regression run returns **pass** or **fail**.
4. **Artifacts** — Save report (JSON) and optionally CSV so we can diff outputs between runs and debug.

So in this phase we add a **golden set** of question IDs, a **regression runner** that runs retrieval + generation on that set and computes retrieval and generation metrics, **threshold checks**, and a **CLI** that prints pass/fail and writes the report.

---

## What you’ll do

- **Golden set** — In `packages/eval/src/data/goldenSet.ts`, define `GOLDEN_SET_IDS` (fixed array of ~50 dev question IDs, chosen to be a mix of answerable and unanswerable). Add `filterToGoldenSet(questions)` and `validateGoldenSet(questions)` (check all golden IDs exist in the provided list).
- **Regression runner** — In `packages/eval/src/runners/regression.ts`, accept Supabase client, golden questions (ParsedQA[]), and options (topK, thresholds). For each question: run searchSections, then generateAnswer. Build RetrievalResult (for Recall@k/MRR) and per-question detail (queryId, question, answerable, goldTechnoteId, retrievedTechnoteIds, retrievalHit, reciprocalRank, answer, citationCount, validCitations, invalidCitations, isAbstention, hasValidCitation, allCitationsValid, tokens). Compute aggregate retrieval metrics (via computeAggregateMetrics) and generation metrics (questionsWithCitations, questionsWithValidCitations, questionsWithAllValidCitations, abstentions, invalidCitationCount, citationValidityRate, abstentionRate, totalTokens). Compare to QualityThresholds (minRecallAtK, minCitationValidityRate, maxAbstentionRate); build thresholdResults (name, threshold, actual, passed, comparison min/max). Report: timestamp, options, thresholds, metrics, thresholdResults, passed (all thresholds pass), details. Add formatRegressionSummary(report) and formatRegressionAsCSV(report).
- **CLI** — In `packages/eval/bin/regression.ts`, load env, get Supabase client, load dev QA from DATA_DIR, filter to golden set (filterToGoldenSet), validate (validateGoldenSet), run regression runner, print formatRegressionSummary(report), and write report JSON and CSV to eval-reports/ with timestamp. Exit with 0 if passed, 1 if failed (optional).

At the end, `pnpm --filter @pkg/eval regression` returns pass/fail and a report artifact; changing prompt or retriever moves metrics in an understandable way.

---

## How (step-by-step)

### 1. Golden set (`packages/eval/src/data/goldenSet.ts`)

- **GOLDEN_SET_IDS:** A fixed array of ~50 question IDs from the dev set. Choose a mix: e.g. ~25 answerable and ~25 unanswerable, and a spread of topics. Document the selection criteria (e.g. “50 fixed IDs, 25 answerable / 25 unanswerable, deterministically selected for reproducibility”).
- **filterToGoldenSet(questions):** Given an array of questions (with `id`), return only those whose `id` is in GOLDEN_SET_IDS. Generic: `filterToGoldenSet<T extends { id: string }>(questions: T[]): T[]`.
- **validateGoldenSet(questions):** Return `{ valid: boolean, missing: string[] }` where missing = GOLDEN_SET_IDS.filter(id => !questionIds.has(id)). Use this to ensure the dev QA load actually contains all golden IDs before running regression.

---

### 2. Quality thresholds and types

- **QualityThresholds:** `minRecallAtK: number`, `minCitationValidityRate: number`, `maxAbstentionRate: number`. Defaults can be based on prior eval runs (e.g. minRecallAtK 0.5, minCitationValidityRate 0.9, maxAbstentionRate 0.98).
- **RegressionDetail:** Per-question: queryId, question, answerable, goldTechnoteId, retrievedTechnoteIds, retrievalHit, reciprocalRank, answer, citationCount, validCitations, invalidCitations, isAbstention, hasValidCitation, allCitationsValid, tokens.
- **RegressionMetrics:** Aggregate: totalQuestions, answerableQuestions, unanswerableQuestions, recallAtK, mrr, retrievalHits, retrievalMisses, questionsWithCitations, questionsWithValidCitations, questionsWithAllValidCitations, abstentions, invalidCitationCount, citationValidityRate, allCitationsValidRate, abstentionRate, totalTokens.
- **ThresholdResult:** name, threshold, actual, passed, comparison ("min" | "max").
- **RegressionReport:** timestamp, options (topK, goldenSetSize), thresholds, metrics, thresholdResults, passed (boolean), details (RegressionDetail[]).

---

### 3. Regression runner (`packages/eval/src/runners/regression.ts`)

- **runRegression(supabase, goldenQuestions, options):** Options: topK (default 5), thresholds (partial QualityThresholds), onProgress(current, total, phase).
- **Loop over golden questions:** For each qa: (1) searchSections(supabase, qa.question, { topK }), (2) build RetrievalResult (queryId, retrievedTechnoteIds from sections, goldTechnoteId), (3) generateAnswer(qa.question, sections), (4) append to details: retrieval + generation fields (retrievalHit, reciprocalRank from computePerQueryMetrics; answer, citationValidation, tokens from generateAnswer). Optionally call onProgress.
- **Aggregate retrieval:** computeAggregateMetrics(retrievalResults, topK) → recallAtK, mrr, hits, misses.
- **Aggregate generation:** From details, compute questionsWithCitations, questionsWithValidCitations, questionsWithAllValidCitations, abstentions, invalidCitationCount; citationValidityRate = questionsWithAllValidCitations / questionsWithCitations (when > 0), abstentionRate = abstentions / totalQuestions, totalTokens = sum of tokens.
- **Threshold checks:** Build thresholdResults: Recall@K (actual >= minRecallAtK), Citation Validity Rate (actual >= minCitationValidityRate), Abstention Rate (actual <= maxAbstentionRate). passed = thresholdResults.every(t => t.passed).
- **Return:** RegressionReport.

**formatRegressionSummary(report):** Return a string (e.g. ASCII box with status PASSED/FAILED, retrieval metrics, generation metrics, threshold checks with ✓/✗). Use this for console output.

**formatRegressionAsCSV(report):** Headers: query_id, answerable, gold_technote_id, retrieval_hit, reciprocal_rank, citation_count, valid_citations, invalid_citations, is_abstention, all_citations_valid, tokens, question_preview, answer_preview. One row per detail. Escape quotes in previews.

---

### 4. CLI (`packages/eval/bin/regression.ts`)

- Load env from `../../.env.local`. Get Supabase client. Resolve DATA_DIR (e.g. raw-data at repo root).
- Load dev QA: loadDevQa(DATA_DIR). Filter: goldenQuestions = filterToGoldenSet(devQa). Validate: validateGoldenSet(goldenQuestions); if !valid, log missing IDs and exit 1.
- Run runRegression(supabase, goldenQuestions, { topK: 5, thresholds: DEFAULT_THRESHOLDS }).
- Print formatRegressionSummary(report).
- Write report to eval-reports/regression-<timestamp>.json and CSV to eval-reports/regression-<timestamp>.csv.
- Optionally process.exit(report.passed ? 0 : 1) so CI can use the exit code.

Add script in packages/eval/package.json: `"regression": "node --env-file=../../.env.local --import tsx ./bin/regression.ts"`.

---

## Checkpoint

- `pnpm --filter @pkg/eval regression` **returns** pass or fail and prints a summary (retrieval + generation metrics and threshold results).
- **Report artifact** (JSON and CSV) is written to eval-reports/ with a timestamp.
- **Changing** the prompt or retriever (e.g. topK) and re-running moves Recall@k, citation validity, or abstention rate in an understandable way.

---

## Commit reference

- `1c7839c` — feat(eval): add regression test CLI and supporting modules (golden set, regression runner, regression.ts).

---

## Next steps

- **Phase 9** — Next.js + shadcn chat UI: build `/api/chat` that calls the agent, optional streaming, and a chat UI with expandable “sources” for citations.
- **Phase 10 (optional)** — Mastra scorers: integrate @mastra/evals for faithfulness, hallucination, and relevancy scorers in regression.

You’ve completed the core pipeline: data → ingest → retrieval → evaluation → grounded answers → agent → regression gates.
