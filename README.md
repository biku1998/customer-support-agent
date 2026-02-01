# Customer Support Copilot

A **RAG-based** (Retrieval-Augmented Generation) customer support agent that answers technical questions using vector search over documentation. Built with TypeScript, Supabase (Postgres + pgvector), and [Mastra](https://mastra.ai/). Answers are **grounded** in retrieved context and include **inline citations** so users can verify every claim.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Pipeline](#pipeline)
- [Evaluation](#evaluation)
- [Dataset Setup](#dataset-setup)
- [Tutorials & Development Plan](#tutorials--development-plan)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

This project implements an intelligent support copilot that:

1. **Indexes** technical documentation (technote sections) as vectors in Postgres using OpenAI embeddings and pgvector.
2. **Retrieves** relevant sections for each user question via semantic similarity (HNSW index, cosine distance).
3. **Generates** answers using only the retrieved context, with inline citations in the form `[section_id]`.
4. **Abstains** when the context is insufficient instead of guessing.
5. **Evaluates** retrieval quality (Recall@k, MRR) and answer quality (citation validity, abstention) with a regression suite for repeatable quality gates.

The agent is implemented as a **Mastra** agent with a single **retrieve** tool. The same pipeline powers both the Mastra playground and (when Phase 9 is done) a Next.js chat UI.

The dataset is [IBM TechQA](https://github.com/IBM/techqa): real technical support questions and answers from IBM Technotes, with pre-chunked sections suitable for RAG.

---

## Features

- **Vector search** — HNSW index on pgvector for fast approximate nearest-neighbor search (cosine similarity).
- **Grounded answers** — LLM is instructed to answer only from retrieved context and cite sources.
- **Citation validation** — Every `[section_id]` in the answer is checked against the provided context; invalid citations are flagged.
- **Abstention detection** — Detects when the model correctly declines to answer due to insufficient context.
- **Retrieval evaluation** — Recall@k and Mean Reciprocal Rank (MRR) on the dev set.
- **Grounded evaluation** — Citation validity and abstention rate on a sample of dev questions.
- **Regression suite** — Fixed golden set of ~50 questions with configurable thresholds (Recall@k, citation validity, abstention rate); pass/fail report and CSV/JSON artifacts.
- **Mastra agent** — Single retrieve tool; observable in Mastra Studio (tool calls, retrieved passages, final answer).
- **Monorepo** — pnpm workspaces; shared TypeScript config and types across ingest, retrieval, agent, and eval.

---

## Architecture

High-level data flow:

```mermaid
flowchart LR
  subgraph data [Data]
    JSON[TechQA JSON]
  end

  subgraph ingest [Ingest]
    Load[Loaders]
    Embed[Embeddings]
    Upsert[Upsert]
  end

  subgraph store [Store]
    Supabase[(Supabase Postgres + pgvector)]
  end

  subgraph retrieval [Retrieval]
    EmbedQ[Embed Query]
    Match[match_sections RPC]
  end

  subgraph agent [Agent]
    Tool[retrieve tool]
    LLM[Answer + citations]
  end

  subgraph eval [Eval]
    RetrievalEval[Recall@k MRR]
    GroundedEval[Citation validity]
    Regression[Golden set gates]
  end

  JSON --> Load
  Load --> Embed
  Embed --> Upsert
  Upsert --> Supabase
  Supabase --> Match
  EmbedQ --> Match
  Match --> Tool
  Tool --> LLM
  Match --> RetrievalEval
  LLM --> GroundedEval
  RetrievalEval --> Regression
  GroundedEval --> Regression
```

- **Ingest:** Load technote sections from JSON → embed with OpenAI `text-embedding-3-small` → upsert into `technote_sections` (and parent `technotes`).
- **Retrieval:** Embed the user query → call `match_sections` RPC (cosine similarity) → return top-k sections.
- **Agent:** Mastra agent calls the retrieve tool, then generates an answer with citations from the returned context.
- **Eval:** Dev set retrieval metrics; grounded answer metrics; regression on a fixed golden set with thresholds.

---

## Tech Stack

| Layer        | Technology |
| ------------ | ---------- |
| **AI / Agent** | [Mastra](https://mastra.ai/) (TypeScript agents, tools, tracing) |
| **Vector Store** | [Supabase](https://supabase.com/) + PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) (HNSW, cosine) |
| **Embeddings** | OpenAI `text-embedding-3-small` (1536 dims) |
| **Generation** | OpenAI `gpt-4o-mini` (grounded answers) |
| **Runtime** | Node.js 20+, TypeScript, ESM |
| **Monorepo** | pnpm workspaces |
| **Frontend** *(Phase 9)* | Next.js + [shadcn/ui](https://ui.shadcn.com/) |
| **Dataset** | [IBM TechQA](https://github.com/IBM/techqa) |

---

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 9.x (e.g. `corepack enable` to use the version in `package.json`)
- **Docker** (or compatible container runtime) for local Supabase
- **OpenAI API key** (embeddings and chat)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-username/customer-support-agent.git
cd customer-support-agent
pnpm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your keys. After starting Supabase (step 3), copy the local API keys from `pnpm db:status` into `.env.local`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from db:status>
SUPABASE_SERVICE_ROLE_KEY=<from db:status>
OPENAI_API_KEY=<your-openai-key>
```

### 3. Start local Supabase

```bash
pnpm db:start
pnpm db:status   # shows URLs and keys; copy into .env.local
```

### 4. Verify setup

```bash
pnpm build
pnpm --filter @pkg/db smoke
```

You should see: **Supabase connection successful!**

### 5. Ingest data (optional)

Place TechQA files in `raw-data/` (see [Dataset Setup](#dataset-setup)), then:

```bash
pnpm --filter @pkg/ingest ingest -- --limit 2000
```

### 6. Try retrieval and agent

```bash
pnpm --filter @pkg/retrieval demo -- "How do I reset my password?"
pnpm --filter @pkg/agent test-agent
```

---

## Project Structure

```
customer-support-agent/
├── apps/
│   └── web/                     # Next.js + shadcn (Phase 9 chat UI)
├── packages/
│   ├── config/                  # Shared TypeScript configs (tsconfig.base.json, tsconfig.node.json)
│   ├── db/                       # Supabase client, generated types, smoke test, test-schema
│   ├── shared/                   # TechQA types (raw/parsed), section IDs, text utilities
│   ├── ingest/                   # Loaders, embeddings, upsert, ingest CLI, inspect, test-similarity
│   ├── retrieval/                # Query embedding, searchSections, match_sections RPC, demo CLI
│   ├── agent/                    # Mastra copilot agent, retrieve tool, generateAnswer, citation validator, test-agent
│   └── eval/                     # Retrieval metrics, dev set runner, grounded eval, regression, golden set
├── supabase/
│   ├── migrations/              # technotes, technote_sections, qa_dev, match_sections RPC
│   └── config.toml              # Local Supabase config
├── tutorials/                    # Phase-wise tutorials (scaffolding → regression)
├── dev-plans/                    # Implementation plan (init.md), tutorial plan (repo-tutorial.md)
└── raw-data/                     # TechQA JSON files (gitignored)
```

| Package    | Purpose |
| ---------- | ------- |
| **config** | Shared `tsconfig`; extended by all packages. |
| **db**     | Typed Supabase client (`getSupabaseClient`), generated `database.types.ts`, smoke script, optional test-schema. |
| **shared** | Raw/parsed TechQA types, `createSectionId` / `parseSectionId`, normalize helpers. |
| **ingest** | Load TechQA JSON; embed sections (OpenAI); upsert technotes + technote_sections; inspect dataset; ingest CLI. |
| **retrieval** | Embed query; call `match_sections` RPC; return `SearchResult[]`; demo CLI. |
| **agent**  | Mastra copilot agent with retrieve tool; grounded answer generation; citation validation; test-agent script. |
| **eval**   | Recall@k, MRR; dev set runner; grounded eval (citations, abstention); regression (golden set, thresholds); JSON/CSV reports. |

---

## Available Scripts

### Root

| Command | Description |
| ------- | ----------- |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove build artifacts |

### Database (Supabase)

| Command | Description |
| ------- | ----------- |
| `pnpm db:start` | Start local Supabase stack (Docker) |
| `pnpm db:stop` | Stop local Supabase |
| `pnpm db:status` | Show services and API keys |
| `pnpm db:reset` | Reset DB and run migrations |
| `pnpm db:diff` | Generate migration from schema diff |
| `pnpm db:generate-types` | Write `packages/db/src/database.types.ts` from local schema |

### Package-specific

| Command | Description |
| ------- | ----------- |
| `pnpm --filter @pkg/db smoke` | Test Supabase connection |
| `pnpm --filter @pkg/db test-schema` | Insert/select one row (schema check) |
| `pnpm --filter @pkg/ingest inspect` | Print dataset counts and samples (requires `raw-data/`) |
| `pnpm --filter @pkg/ingest ingest -- --limit N` | Ingest first N sections (default: all) |
| `pnpm --filter @pkg/retrieval demo -- "question"` | Run retrieval for one question |
| `pnpm --filter @pkg/agent test-agent` | Run agent with a sample question |
| `pnpm --filter @pkg/eval retrieval` | Run retrieval eval on dev set |
| `pnpm --filter @pkg/eval grounded` | Run grounded answer eval (sample) |
| `pnpm --filter @pkg/eval regression` | Run regression suite (golden set, pass/fail) |

---

## Pipeline

1. **Ingest** — Load `training_dev_technotes.sections.json` and optional Q&A files; embed section content; upsert into `technotes` and `technote_sections`. Idempotent (upsert on `id`).
2. **Retrieval** — Given a question, embed it and call `match_sections(query_embedding, match_count)`; get top-k sections with similarity scores.
3. **Agent** — User question → Mastra agent calls retrieve tool → tool returns formatted context → agent generates answer with `[section_id]` citations.
4. **Eval** — Retrieval: run search on dev questions, compute Recall@k and MRR. Grounded: sample questions, generate answers, check citation validity and abstention. Regression: fixed golden set, thresholds (Recall@k, citation validity, abstention rate), pass/fail and report artifacts.

---

## Evaluation

- **Retrieval** (`pnpm --filter @pkg/eval retrieval`): Recall@k (gold technote in top-k?), MRR. Report: JSON + CSV in `packages/eval/eval-reports/`.
- **Grounded** (`pnpm --filter @pkg/eval grounded`): Citation validity (all `[id]` in provided context?), abstention detection. Report: JSON + CSV.
- **Regression** (`pnpm --filter @pkg/eval regression`): Golden set of ~50 dev questions; thresholds for Recall@k, citation validity rate, abstention rate; pass/fail summary and per-question CSV/JSON. Use for CI or before/after prompt or retriever changes.

---

## Dataset Setup

The project uses the [TechQA dataset](https://github.com/IBM/techqa). Place these files in **`raw-data/`** at the repo root:

| File | Description |
| ---- | ----------- |
| `training_Q_A.json` | Training Q&A pairs |
| `dev_Q_A.json` | Dev Q&A (evaluation) |
| `training_dev_technotes.sections.json` | Pre-chunked technote sections (indexing unit) |

`raw-data/` is gitignored. After adding the files, run `pnpm --filter @pkg/ingest inspect` to verify counts and samples, then run the ingest CLI.

---

## Tutorials & Development Plan

- **Tutorials** — Step-by-step, phase-wise tutorials for beginners: [tutorials/README.md](tutorials/README.md). Covers scaffolding → dataset loaders → Supabase schema → embeddings & ingestion → retrieval API → retrieval eval → grounded answers & citations → Mastra agent → regression suite. Each phase has Why, What, How, Checkpoint, and commit references.
- **Implementation plan** — Full phase list and checkpoints: [dev-plans/init.md](dev-plans/init.md). Progress: Phases 0–8 done; Phase 9 (Next.js chat UI) and Phase 10 (optional Mastra scorers) planned.
- **Tutorial plan** — Commit-to-phase mapping and file layout: [dev-plans/repo-tutorial.md](dev-plans/repo-tutorial.md).

---

## Local Development

### Supabase Studio

After `pnpm db:start`, open:

**http://localhost:54323**

Use it to inspect tables, run SQL, and view RPCs.

### Direct Postgres

For external tools (pgAdmin, DataGrip, etc.):

```
postgresql://postgres:postgres@localhost:54322/postgres
```

### Schema workflow

1. Change schema in Studio or SQL.
2. Generate migration: `pnpm db:diff -f my_migration_name`
3. Review `supabase/migrations/`.
4. Apply: `pnpm db:reset`
5. Regenerate types: `pnpm db:generate-types`

---

## Troubleshooting

### Docker not running

```
Error: Cannot connect to the Docker daemon
```

Start Docker Desktop (or your container runtime) and run `pnpm db:start` again.

### Port conflicts

If Supabase ports (54321–54323, 54322) are in use:

```bash
pnpm db:stop
# Stop conflicting services or adjust supabase/config.toml
pnpm db:start
```

### Database connection fails

1. Confirm Supabase is up: `pnpm db:status`
2. Ensure `.env.local` matches the keys from `db:status`
3. Run: `pnpm --filter @pkg/db smoke`

### Missing raw-data or inspect fails

Create `raw-data/` at the repo root and add the TechQA JSON files (see [Dataset Setup](#dataset-setup)). Then run `pnpm --filter @pkg/ingest inspect`.

### Regression or eval fails

Ensure you have ingested data (`pnpm --filter @pkg/ingest ingest -- --limit 5000`) and that `raw-data/dev_Q_A.json` exists for the eval and regression scripts.

---

## Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feature/short-description`.
3. Make changes; run `pnpm build && pnpm typecheck`.
4. Commit with a clear message.
5. Open a pull request.

---

## License

MIT
