# Phase 4 — Retrieval API

**Checkpoint:** Top-k retrieval works from TypeScript; `pnpm --filter @pkg/retrieval demo -- "my question"` prints top-k with ids and snippets; latency is acceptable.

**Commit:** `5d3ed97` (retrieval package: embedQuery, search, demo).

---

## Why

The agent and eval need a **single “search the knowledge base” API** from TypeScript:

1. **Embed the query** — Turn the user’s question into a vector with the same model and dimension as the ingested sections (e.g. OpenAI `text-embedding-3-small`).
2. **Run similarity search** — Call the `match_sections` RPC with the query embedding and `match_count` (top-k).
3. **Return structured results** — Map RPC rows to a `SearchResult` type (id, technoteId, sectionIdx, heading, content, similarity) so the agent and eval can consume them.

Keeping this in a dedicated **retrieval** package (separate from ingest) makes it easy to depend on it from both the Mastra agent and the eval runners without pulling in ingest or embedding batch logic.

---

## What you’ll do

- **Package:** Create `packages/retrieval` with dependencies on `@pkg/db` and OpenAI (or the same embedding client you use for queries).
- **embedQuery** — In `packages/retrieval/src/embedQuery.ts`, implement `embedQuery(query: string, model?): Promise<number[]>` using the same embedding model as ingest (e.g. `text-embedding-3-small`). Return the query vector.
- **searchSections** — In `packages/retrieval/src/search.ts`, implement `searchSections(supabase, query, options?)` where options include `topK` (default 5) and optionally `filterTechnoteId`. Inside: call `embedQuery(query)`, then `supabase.rpc("match_sections", { query_embedding: "[...]", match_count: topK, filter_technote_id: ... })`. Map returned rows to `SearchResult[]`; convert cosine **distance** to a **similarity** score (e.g. `1 - distance` so higher = more similar).
- **searchWithEmbedding** — Optional: same as search but accept a precomputed `embedding: number[]` so callers can avoid embedding twice when running many queries.
- **Demo CLI** — In `packages/retrieval/bin/demo.ts`, parse a question from CLI args (e.g. the first positional arg), get Supabase client (with `.env.local`), call `searchSections(supabase, question, { topK: 5 })`, and print each result: id, technoteId, heading, content snippet, similarity.

At the end, running the demo with a question prints top-k sections with acceptable latency.

---

## How (step-by-step)

### 1. Create the retrieval package

- **package.json:** `name: "@pkg/retrieval"`, `type: "module"`, dependencies: `@pkg/db`, `openai` (or your embedding client). DevDependencies: `@pkg/config`, `tsx`, `typescript`, `@types/node`. Scripts: `build`, `typecheck`, `clean`, `demo` (e.g. `node --env-file=../../.env.local --import tsx ./bin/demo.ts` with args passed through).
- **tsconfig.json:** Extend `@pkg/config/tsconfig.base.json`, set `outDir: "dist"`, `rootDir: "src"` (and include `bin` if needed or use a separate config for bin).
- **src/index.ts:** Export `embedQuery`, `searchSections`, `searchWithEmbedding`, and types `SearchResult`, `SearchOptions`.

---

### 2. embedQuery (`packages/retrieval/src/embedQuery.ts`)

- Use the same model as ingest: `text-embedding-3-small`.
- Create an OpenAI client (or reuse your existing one); call `embeddings.create({ model, input: query })`.
- Return `response.data[0].embedding` as `number[]`. Throw if missing.

This keeps query and document embeddings in the same space so similarity search is meaningful.

---

### 3. searchSections (`packages/retrieval/src/search.ts`)

- **SearchResult type:** `id`, `technoteId`, `sectionIdx`, `heading`, `content`, `similarity` (number, 0–1).
- **SearchOptions:** `topK?: number` (default 5), `filterTechnoteId?: string | null`.
- **Logic:**
  1. Call `embedQuery(query)` to get the query vector.
  2. Format the vector as a string `[a,b,c,...]` for the RPC.
  3. Call `supabase.rpc("match_sections", { query_embedding: vectorStr, match_count: topK, filter_technote_id: filterTechnoteId ?? undefined })`.
  4. Map each row to `SearchResult`: `similarity = 1 - row.similarity` (pgvector returns cosine **distance**; converting to 1 - distance gives a similarity score where 1 is best).
  5. Return the array.

Handle RPC errors (e.g. throw with a clear message).

---

### 4. searchWithEmbedding (optional)

Same as `searchSections` but accept `(supabase, embedding: number[], options)` and skip the `embedQuery` call. Useful when you already have the query embedding (e.g. in eval when you want to reuse one embedding for multiple operations).

---

### 5. Demo CLI (`packages/retrieval/bin/demo.ts`)

- Parse the first positional argument as the question (e.g. `process.argv[2]` or use `node:util` `parseArgs`). If missing, print usage and exit.
- Load env from `../../.env.local` (via `--env-file` in the script command).
- Get Supabase client with `getSupabaseClient()`.
- Call `searchSections(supabase, question, { topK: 5 })`.
- Print a short header and then each result: `id`, `technoteId`, `heading`, first ~200 chars of `content`, `similarity`.

Example run:

```bash
pnpm --filter @pkg/retrieval demo -- "How do I reset my password in Tivoli Storage Manager?"
```

---

## Checkpoint

- `pnpm --filter @pkg/retrieval demo -- "my question"` **prints** top-k sections with ids and snippets.
- **Latency** is acceptable for your environment (embedding + one RPC call).
- Results are **plausible** (e.g. relevant technote sections for the question).

---

## Commit reference

- `5d3ed97` — feat: implement retrieval package with search and embedding functionalities.

---

## Next

Go to [05-retrieval-eval.md](05-retrieval-eval.md) to add retrieval evaluation (Recall@k, MRR, dev set runner, report).
