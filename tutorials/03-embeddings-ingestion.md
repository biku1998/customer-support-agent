# Phase 3 — Embeddings + ingestion pipeline

**Checkpoint:** N sections embedded and searchable; ingest runs without duplicates; DB has expected row counts; a basic similarity query returns plausible sections.

**Commits:** `fa9ebab` (embeddings, upsert, match_sections RPC), `03a7333` (ingest CLI, test-similarity).

---

## Why

For RAG we need sections **embedded** and **stored** so that:

1. **Similarity search** — We can turn a user question into a vector and find the closest section vectors (e.g. cosine similarity). That requires an embedding model (we use OpenAI’s `text-embedding-3-small`, 1536 dimensions) and a way to store vectors in Postgres (pgvector).
2. **Idempotent upserts** — Re-running ingest should not create duplicates; upsert on section `id` keeps data consistent.
3. **Batching** — Embedding and DB writes in batches (e.g. 64–256) keeps rate limits and connection usage under control.

We also add a **match_sections** RPC so that retrieval (Phase 4) can run similarity search in one call. Phase 3 delivers: embedding wrapper, upsert logic, RPC, and an ingest CLI that loads sections, embeds them, and upserts into Supabase.

---

## What you’ll do

- **Embedding wrapper** — In `packages/ingest/src/embeddings/embed.ts`, implement `createEmbeddings(texts, config)` (batched), `createEmbedding(text)`, and `getEmbeddingDimension(model)`; use OpenAI’s `text-embedding-3-small`; truncate long text to stay within token limits.
- **Upsert** — In `packages/ingest/src/upsert/upsertSections.ts`, implement `upsertTechnotes(supabase, technotes, config)` and `upsertSections(supabase, sections, embeddings, config)` with `onConflict: "id"`; format embedding as pgvector string `[a,b,c,...]`; add `getSectionCount` and `getTechnoteCount` for verification.
- **match_sections RPC** — New migration: a Postgres function that takes `query_embedding vector(1536)`, `match_count int`, optional `filter_technote_id text`; returns rows with `id`, `technote_id`, `section_idx`, `heading`, `content`, `similarity` (cosine distance); order by `embedding <=> query_embedding` and limit by `match_count`.
- **Ingest CLI** — In `packages/ingest/bin/ingest.ts`, load technotes and sections (with optional `--limit`), upsert technotes, create embeddings in batches, upsert sections, then verify counts; use `--env-file=../../.env.local` when running.
- **Optional:** A small script (e.g. `test-similarity.ts`) that embeds one query and calls the RPC to confirm similarity search works.

At the end, ingest runs without duplicates, DB has the expected section/technote counts, and a basic similarity query returns plausible sections.

---

## How (step-by-step)

### 1. Embedding wrapper (`packages/ingest/src/embeddings/embed.ts`)

- **Model:** Use OpenAI’s `text-embedding-3-small` (1536 dimensions). Match this in the DB `vector(1536)` and in the RPC.
- **Truncation:** Embedding models have token limits. Truncate each text to a safe length (e.g. ~28k characters for 8k tokens) before sending.
- **createEmbeddings(texts: string[], config?):** Call OpenAI embeddings API in batches (e.g. batch size 100). Sort results by `index` so the returned array order matches the input order. Return `number[][]`.
- **createEmbedding(text: string):** Return the first element of `createEmbeddings([text])`.
- **getEmbeddingDimension(model?):** Return 1536 for `text-embedding-3-small` (and optionally other models) so callers know the dimension.

Use the OpenAI SDK; read the API key from `process.env.OPENAI_API_KEY` (or rely on the SDK default).

---

### 2. Upsert (`packages/ingest/src/upsert/upsertSections.ts`)

- **upsertTechnotes(supabase, technotes, config):** Map each `ParsedTechnote` to a row: `id`, `title`, `full_text`, `section_count`. Upsert in batches with `onConflict: "id"`. Optional `onProgress(current, total, type)` callback.
- **upsertSections(supabase, sections, embeddings, config):** Ensure `sections.length === embeddings.length`. For each section, build a row: `id`, `technote_id`, `section_idx`, `heading`, `content`, `span_start`, `span_end`, `embedding`. Format `embedding` as a string `[x,y,z,...]` for pgvector. Upsert in batches with `onConflict: "id"`. Optional progress callback.
- **getSectionCount(supabase):** `select("*", { count: "exact", head: true })` on `technote_sections`; return count.
- **getTechnoteCount(supabase):** Same for `technotes`.

Use the typed Supabase client (`TypedSupabaseClient`) and the generated table types (`TechnoteInsert`, `TechnoteSectionInsert`) from `@pkg/db`.

---

### 3. Migration: match_sections RPC

Create a new migration file, e.g. `supabase/migrations/20260129194048_add_match_sections_rpc.sql`:

```sql
create or replace function match_sections(
  query_embedding vector(1536),
  match_count int default 5,
  filter_technote_id text default null
)
returns table (
  id text,
  technote_id text,
  section_idx int,
  heading text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ts.id,
    ts.technote_id,
    ts.section_idx,
    ts.heading,
    ts.content,
    (ts.embedding <=> query_embedding) as similarity
  from technote_sections ts
  where ts.embedding is not null
    and (filter_technote_id is null or ts.technote_id = filter_technote_id)
  order by ts.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_sections to anon, authenticated;
```

Run `pnpm supabase db reset` (or apply migrations) so the function exists. Regenerate types if your tooling emits RPC types: `pnpm db:generate-types`.

---

### 4. Ingest CLI (`packages/ingest/bin/ingest.ts`)

- **Args:** Optional `--limit N` to ingest only the first N sections (for fast iteration). Optional `--embedding-batch` and `--upsert-batch` (defaults e.g. 100).
- **Data path:** Resolve `raw-data` (or your data dir) relative to the repo; load technotes and sections with `loadTechnotesFromDir` and `loadAllSections`. If `--limit` is set, slice the sections array and derive the set of technotes that have sections in that slice.
- **Steps:**
  1. Load technotes and all sections; optionally slice sections by `--limit`.
  2. Connect to Supabase with `getSupabaseClient()` (ensure `.env.local` is loaded via `--env-file`).
  3. Upsert technotes (only those that have sections in the slice).
  4. Create embeddings for section contents in batches; log time and rate.
  5. Upsert sections with their embeddings.
  6. Log final section and technote counts (e.g. via `getSectionCount` / `getTechnoteCount`).

Run with:  
`pnpm --filter @pkg/ingest ingest`  
or with a limit:  
`pnpm --filter @pkg/ingest ingest -- --limit 1000`

---

### 5. Optional: test-similarity script

A small script that:

- Loads env from `.env.local`.
- Gets Supabase client.
- Embeds one query string (e.g. “How do I reset my password?”) with `createEmbedding`.
- Calls `match_sections` RPC (via `supabase.rpc("match_sections", { query_embedding: "[...]", match_count: 5 })`).
- Logs the top few results (id, technote_id, heading, content preview, similarity).

This confirms that embedding + RPC work before you build the retrieval package.

---

## Checkpoint

- **Ingest** runs without duplicates; re-running ingest with the same data does not create duplicate rows (upsert on `id`).
- **DB** contains the expected number of technotes and sections for your slice (e.g. after `--limit 5000`).
- **Similarity query** (via test-similarity or a one-off script) returns plausible sections for a sample question.

---

## Commit reference

- `fa9ebab` — feat: add embedding utilities and upsert functionality for technote sections; add match_sections RPC.
- `03a7333` — feat: add ingestion and similarity search scripts for TechQA dataset.

---

## Next

Go to [04-retrieval-api.md](04-retrieval-api.md) to implement the retrieval API (embedQuery, searchSections, demo CLI).
