# Phase 2 — Supabase schema + vector index

**Checkpoint:** DB ready for RAG; migrations run cleanly; HNSW index exists; you can insert and query one row.

**Commit:** `cbe68fb` (DB schema, technote_sections, qa_dev, migration, test-schema).

---

## Why

RAG needs a **persistent store** for:

1. **Technote sections** — Each section (the retrieval unit) has text and an **embedding** (a fixed-size vector). We need a table that stores section id, technote id, heading, content, and `embedding vector(1536)` so we can run similarity search.
2. **Vector search** — Postgres’s **pgvector** extension provides a `vector` type and indexes. **HNSW** (Hierarchical Navigable Small World) is recommended by Supabase for approximate nearest-neighbor search with cosine distance.
3. **Article-level metadata** — Optionally, a `technotes` table holds document-level info (id, title, section_count) so we can refer to the parent document and avoid storing duplicate metadata on every section.
4. **Eval** — A `qa_dev` table can store dev questions and gold technote ids for evaluation runs; we’ll use it later for retrieval eval.

If we don’t set the schema and index now, we can’t ingest embeddings or run similarity search in the next phases.

---

## What you’ll do

- **Enable pgvector** in a new migration.
- **Create tables**: `technotes` (id, title, full_text, section_count, timestamps), `technote_sections` (id PK, technote_id FK, section_idx, heading, content, span_start/span_end, embedding vector(1536), unique(technote_id, section_idx)), `qa_dev` (id, title, question, answer, answerable, gold_technote_id, answer_span_start/end, candidate_doc_ids, created_at).
- **Add HNSW index** on `technote_sections.embedding` with `vector_cosine_ops` (cosine distance).
- **Add triggers** (optional) to keep `updated_at` in sync.
- **Regenerate DB types** so the Supabase client is typed: `pnpm db:generate-types` (writes `packages/db/src/database.types.ts`).
- **Optional:** A small script in `packages/db` (e.g. `test-schema.ts`) that inserts one row and selects it to verify the schema.

At the end, `pnpm supabase db reset` runs cleanly, the HNSW index exists, and you can insert/select one row via Studio or the test script.

---

## How (step-by-step)

### 1. New migration file

In `supabase/migrations/`, create a new file with a timestamp prefix, e.g. `20260129192112_create_technote_sections.sql`. All statements in this file will run in order when you run `supabase db reset` or apply migrations.

---

### 2. Enable pgvector

```sql
create extension if not exists vector;
```

This enables the `vector` type and related operators (e.g. `<=>` for cosine distance).

---

### 3. Table: technotes

Article-level metadata. Sections reference this via `technote_id`.

```sql
create table if not exists technotes (
  id text primary key,
  title text not null,
  full_text text,
  section_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 4. Table: technote_sections

The **primary retrieval unit** for RAG. Each row is one section with a stable id (`technoteId#sectionIdx`), content, and an embedding. The dimension **1536** matches OpenAI’s `text-embedding-3-small`; if you use another model, change the dimension (pgvector supports up to a few thousand dimensions depending on your Postgres version).

```sql
create table if not exists technote_sections (
  id text primary key,
  technote_id text not null references technotes(id) on delete cascade,
  section_idx integer not null,
  heading text,
  content text not null,
  span_start integer,
  span_end integer,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(technote_id, section_idx)
);

-- HNSW index for cosine similarity (lower distance = more similar)
create index if not exists technote_sections_embedding_hnsw
on technote_sections
using hnsw (embedding vector_cosine_ops);

create index if not exists technote_sections_technote_id_idx
on technote_sections(technote_id);
```

---

### 5. Table: qa_dev

Stores dev-set questions and gold technote id for retrieval evaluation.

```sql
create table if not exists qa_dev (
  id text primary key,
  title text not null,
  question text not null,
  answer text,
  answerable boolean not null default true,
  gold_technote_id text,
  answer_span_start integer,
  answer_span_end integer,
  candidate_doc_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists qa_dev_answerable_idx on qa_dev(answerable);
```

---

### 6. Triggers for updated_at (optional)

```sql
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger technotes_updated_at
  before update on technotes
  for each row execute function update_updated_at_column();

create trigger technote_sections_updated_at
  before update on technote_sections
  for each row execute function update_updated_at_column();
```

---

### 7. Regenerate TypeScript types

After migrations are applied (e.g. after `pnpm supabase db reset`), generate the Supabase TypeScript types so the client is typed:

```bash
pnpm db:generate-types
```

This runs `supabase gen types typescript --local` and writes to `packages/db/src/database.types.ts`. Your `getSupabaseClient()` and table types (e.g. `Tables<"technote_sections">`) will match the schema.

---

### 8. Test-schema script (optional)

In `packages/db`, add a script (e.g. `src/test-schema.ts`) that:

- Gets the Supabase client (with `.env.local` loaded).
- Inserts one row into `technotes` and one into `technote_sections` (with a placeholder or null embedding if you haven’t run ingest yet).
- Selects them back and logs success.

Run with: `pnpm --filter @pkg/db test-schema`. This verifies that the schema and client work end-to-end.

---

## Checkpoint

- `pnpm supabase db reset` runs **without errors** and applies the migration.
- In Supabase Studio (e.g. http://localhost:54323) or via a script, you can **insert one row** into `technote_sections` and **query it back**.
- The **HNSW index** exists: e.g. `\d technote_sections` in psql or Studio shows the index on `embedding`.
- `pnpm db:generate-types` produces an updated `packages/db/src/database.types.ts` with `technotes`, `technote_sections`, and `qa_dev`.

---

## Commit reference

- `cbe68fb` — Enhance database schema and testing setup for technotes and sections (migration, test-schema, dotenv in db package).

---

## Next

Go to [03-embeddings-ingestion.md](03-embeddings-ingestion.md) to add embeddings and the ingestion pipeline (embed.ts, upsertSections, match_sections RPC, ingest CLI).
