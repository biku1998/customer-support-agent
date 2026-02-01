# Phase 6 — Grounded answer generation + citations

**Checkpoint:** Answers cite retrieved sections; for a sample of dev questions the agent returns an answer with at least one valid citation and abstains when retrieval is empty or irrelevant.

**Commit:** `5d675af` (grounded answer, prompts, citation validator, groundedEval).

---

## Why

Support answers must be **grounded** in retrieved context and **cite** sources:

1. **Answer only from context** — The LLM must not use prior knowledge; every claim should come from the provided sections. This reduces hallucinations and keeps answers accurate.
2. **Inline citations** — We use a simple format: `[section_id]` (e.g. `[swg24042191#2]`) so users and evaluators can trace claims to a specific section.
3. **Abstain when insufficient** — If the context doesn’t contain enough information, the model should say so (e.g. “I don’t have enough information”) instead of guessing.
4. **Validation** — We need a **citation validator** that checks every `[section_id]` in the answer refers to a retrieved section id, and optionally detect abstention phrases.

So in this phase we define the **answer prompt contract**, implement **generateAnswer** (retrieved sections → LLM → answer + citation validation), implement the **citation validator**, and add a **grounded eval** runner that samples dev questions and reports citation validity and abstention.

---

## What you’ll do

- **Answer prompt** — In `packages/agent/src/prompts/answer.ts`, define `GROUNDED_ANSWER_SYSTEM_PROMPT` (answer only from context, cite with [section_id], abstain if insufficient), `ContextSection` (id, technoteId, heading, content), `formatContext(sections)`, and `buildUserMessage(question, sections)` that builds the full user message with context and question.
- **generateAnswer** — In `packages/agent/src/generateAnswer.ts`, accept `(question, retrievedSections, options)`. Convert SearchResult to ContextSection, build user message, call OpenAI chat completion with the system prompt and user message, then run citation validation on the response. Return `{ answer, citationValidation, contextSectionIds, usage }`. Optionally add `answerQuestion(supabase, question, options)` that runs retrieval then generateAnswer (convenience).
- **Citation validator** — In `packages/agent/src/validators/citation.ts`, implement `extractCitations(answer)` (regex for `[id]`, filter out markdown/link false positives), `validateCitations(answer, providedSectionIds)` (all citations must be in providedSectionIds; return isValid, validCitations, invalidCitations, citationCount), and `detectAbstention(answer)` (phrase list like “i don’t have enough information”). Return `CitationValidationResult`.
- **Grounded eval runner** — In `packages/eval`, add a runner that samples dev questions (e.g. 25), for each runs retrieval then generateAnswer, and collects citation validity and abstention; output report (JSON/CSV) with aggregate and per-question details. Add `packages/eval/bin/grounded.ts` that loads dev QA, runs the grounded runner, and writes the report.

At the end, for a sample of dev questions, answers have at least one valid citation where applicable and abstain when retrieval is empty or irrelevant.

---

## How (step-by-step)

### 1. Agent package setup

- **package.json:** `name: "@pkg/agent"`, dependencies: `@pkg/db`, `@pkg/retrieval`, `openai`. Scripts: `build`, `typecheck`, `clean`, `demo` (e.g. run a simple generateAnswer demo). Later you’ll add Mastra and test-agent.
- **tsconfig.json:** Extend `@pkg/config/tsconfig.base.json`. Export from `src/index.ts`: generateAnswer, prompts, validators, and types.

---

### 2. Answer prompt (`packages/agent/src/prompts/answer.ts`)

- **ContextSection:** `id`, `technoteId`, `heading`, `content` (aligned with SearchResult).
- **GROUNDED_ANSWER_SYSTEM_PROMPT:** Instruct the model to:
  - Answer **only** from the provided context sections.
  - Include **inline citations** for every factual claim using `[section_id]` (exact id from the context).
  - If the context does **not** contain sufficient information, say “I don’t have enough information to answer this question” and optionally suggest what would help; do **not** make up or guess.
  - Be concise but complete; preserve technical accuracy (exact terms, commands, values from context).
- **formatContext(sections):** For each section, output something like `[Section ID: <id>]\n## <heading>\n<content>` with separators between sections. If no sections, return “No relevant context found.”
- **buildUserMessage(question, sections):** Combine formatted context and the question into one user message (e.g. “## Context\n…\n---\n## Question\n…\nPlease provide an answer based on the context above. Remember to cite your sources using [section_id] format.”).

---

### 3. generateAnswer (`packages/agent/src/generateAnswer.ts`)

- **Input:** `question: string`, `retrievedSections: SearchResult[]`, optional options (model, temperature, maxTokens).
- **Steps:**
  1. Map each SearchResult to ContextSection (id, technoteId, heading, content).
  2. Build user message with `buildUserMessage(question, contextSections)`.
  3. Call OpenAI `chat.completions.create` with system content = GROUNDED_ANSWER_SYSTEM_PROMPT and user content = user message. Use a small model (e.g. gpt-4o-mini), temperature 0, reasonable max_tokens.
  4. Get the assistant message content as `answer`.
  5. Run `validateCitations(answer, contextSectionIds)` to get CitationValidationResult.
  6. Return `{ answer, citationValidation, contextSectionIds, usage }` (usage from response.usage).
- **answerQuestion(supabase, question, options):** Optional convenience: call `searchSections(supabase, question, { topK })`, then `generateAnswer(question, retrievedSections, options)` and return the result plus `retrievedSections`.

---

### 4. Citation validator (`packages/agent/src/validators/citation.ts`)

- **extractCitations(answer):** Use a regex like `/\[([^\]]+)\]/g` to find all `[…]` and capture the inner string. Filter out obvious non-citations: e.g. strings starting with `http`, “Section ID:”, or literal “section_id” / “section1” / “section2”. Return string[].
- **validateCitations(answer, providedSectionIds):** Call extractCitations; build a Set from providedSectionIds. For each citation, if it’s in the set add to validCitations, else add to invalidCitations. Return `CitationValidationResult`: isValid = invalidCitations.length === 0, citationCount, validCitations, invalidCitations, isAbstention = detectAbstention(answer).
- **detectAbstention(answer):** Lowercase the answer and check for phrases like “i don’t have enough information”, “i cannot answer”, “insufficient information”, “not enough context”, etc. Return boolean.

---

### 5. Grounded eval runner and CLI

- **Runner** (e.g. `packages/eval/src/runners/groundedEval.ts`): Load dev QA, sample N questions (e.g. 25). For each: run searchSections then generateAnswer. Collect per-question: queryId, question, answer, citationValidation (citationCount, validCitations, invalidCitations, isAbstention), and optionally retrieval hit. Aggregate: count with at least one valid citation, count with all citations valid, count abstentions. Write report (timestamp, options, aggregate, details) and optionally CSV.
- **CLI** (`packages/eval/bin/grounded.ts`): Load env, get Supabase client, load dev QA, run grounded runner, write report to eval-reports/ (e.g. grounded-eval-<timestamp>.json and .csv). Print short summary.

Run with:

```bash
pnpm --filter @pkg/eval grounded
```

---

## Checkpoint

- For a **sample of dev questions** (e.g. 25), the agent returns an answer with **at least one valid citation** when context is sufficient.
- When retrieval is **empty** or **irrelevant**, the agent **abstains** (detected by phrase list) instead of hallucinating.
- **Citation validator** correctly marks invalid citations when the model cites a non-provided section id.

---

## Commit reference

- `5d675af` — Add grounded evaluation runner and report generation (generateAnswer, prompts, citation validator, groundedEval, agent package, grounded.ts).

---

## Next

Go to [07-mastra-agent.md](07-mastra-agent.md) to wire the Mastra agent with the retrieve tool.
