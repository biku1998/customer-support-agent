# Customer Support Copilot — Tutorials

A phase-wise tutorial for building a **RAG-based Customer Support Copilot** from scratch: ingest technical docs, search by meaning, and generate answers with citations using a Mastra agent.

---

## Who this is for

- **Complete beginners** to RAG (Retrieval-Augmented Generation) and vector search
- Developers who want to understand **why**, **what**, and **how** behind each step
- Anyone who wants to follow the same implementation plan and commit history used in this repo

---

## What you'll build

An end-to-end system that:

1. **Loads** TechQA-style Q&A and technote sections from JSON
2. **Stores** sections and their embeddings in Supabase (Postgres + pgvector)
3. **Searches** by semantic similarity (embed query → top-k sections)
4. **Evaluates** retrieval (Recall@k, MRR) on a dev set
5. **Generates** grounded answers with inline citations from retrieved context
6. **Wires** a Mastra agent that uses a “retrieve” tool and answers with citations
7. **Gates** quality with a regression suite (golden set + thresholds)

---

## Prerequisites

- **Node.js 20+**
- **pnpm** (e.g. `npm install -g pnpm`)
- **Docker** (or another container runtime) for local Supabase
- **Basic TypeScript** and terminal usage
- **OpenAI API key** (for embeddings and chat)

---

## How to use this tutorial

1. **Read in order.** Each phase builds on the previous one.
2. **Follow the checkpoints.** At the end of each phase you can verify your work.
3. **Use the commit references.** The plan maps each phase to real commits on `main` so you can see how the codebase evolved.

**Tutorial plan:** [../dev-plans/repo-tutorial.md](../dev-plans/repo-tutorial.md) — full plan, commit mapping, and file layout.

---

## Architecture overview

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

**Jargon (defined in context in each phase):**

- **RAG** — Retrieval-Augmented Generation: answer using retrieved documents instead of only model knowledge.
- **Embedding** — A fixed-size vector representing text for similarity search.
- **HNSW** — Hierarchical Navigable Small World: an index type in pgvector for fast approximate nearest-neighbor search.
- **Recall@k** — Fraction of questions where the “gold” document appears in the top-k results.
- **MRR** — Mean Reciprocal Rank: average of 1/rank of the first relevant result.
- **Citation** — Inline reference like `[section_id]` pointing to a retrieved section.
- **Golden set** — Fixed set of questions used for regression testing.
- **Regression gate** — Pass/fail thresholds (e.g. Recall@k, citation validity) to catch regressions.

---

## Tutorial phases

| Phase | Document | What you do |
| ----- | -------- | ----------- |
| 0 | [00-scaffolding.md](00-scaffolding.md) | Monorepo, Supabase init, smoke test |
| 1 | [01-dataset-loaders.md](01-dataset-loaders.md) | TechQA loaders + inspect script |
| 2 | [02-supabase-schema.md](02-supabase-schema.md) | Tables + vector index + migrations |
| 3 | [03-embeddings-ingestion.md](03-embeddings-ingestion.md) | Embeddings, upsert, ingest CLI |
| 4 | [04-retrieval-api.md](04-retrieval-api.md) | Query embedding + search + demo |
| 5 | [05-retrieval-eval.md](05-retrieval-eval.md) | Recall@k, MRR, dev set runner |
| 6 | [06-grounded-answers-citations.md](06-grounded-answers-citations.md) | Answer prompt, citations, validator |
| 7 | [07-mastra-agent.md](07-mastra-agent.md) | Mastra agent + retrieve tool |
| 8 | [08-regression-suite.md](08-regression-suite.md) | Golden set + regression runner |

**Next steps (not yet in this repo):**

- Phase 9 — Next.js + shadcn chat UI
- Phase 10 *(optional)* — Mastra scorers for enhanced eval

Start with [00-scaffolding.md](00-scaffolding.md).
