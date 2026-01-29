# Customer Support Copilot

A RAG-based (Retrieval-Augmented Generation) customer support agent built with TypeScript. Uses vector search over technical documentation to provide grounded, citation-backed answers to support questions.

## What It Does

This project implements an intelligent support copilot that:

- **Retrieves** relevant documentation sections using vector similarity search (pgvector)
- **Generates** grounded answers based only on retrieved context
- **Cites** sources so users can verify information
- **Evaluates** retrieval quality with Recall@k and MRR metrics

Built on IBM's [TechQA dataset](https://github.com/IBM/techqa) - a collection of real technical support questions and answers from IBM's Technotes.

## Tech Stack

| Component | Technology |
| --------- | ---------- |
| AI Framework | [Mastra](https://mastra.ai/) (TypeScript agents, RAG, evals, tracing) |
| Vector Store | [Supabase](https://supabase.com/) + PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) (HNSW indexes) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Frontend | Next.js + [shadcn/ui](https://ui.shadcn.com/) |
| Language | TypeScript (pnpm workspaces monorepo) |

## Prerequisites

- **Node.js** 20+
- **pnpm** 9.x (`corepack enable` to use the version from package.json)
- **Docker** (for local Supabase)
- **OpenAI API key** (for embeddings)

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-username/customer-support-agent.git
cd customer-support-agent
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
# These are auto-populated when you run `pnpm db:start`
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Required for embeddings
OPENAI_API_KEY=your-openai-api-key

# Optional: for Claude-based generation
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### 3. Start local Supabase

```bash
# Start Docker containers (downloads images on first run)
pnpm db:start

# Check status - this also shows your local API keys
pnpm db:status
```

Update `.env.local` with the keys shown by `db:status`.

### 4. Verify setup

```bash
# Run build to ensure everything compiles
pnpm build

# Test database connection
pnpm --filter @pkg/db smoke
```

You should see: `✅ Supabase connection successful!`

## Project Structure

```text
customer-support-agent/
├── apps/
│   └── web/                    # Next.js + shadcn chat UI
├── packages/
│   ├── config/                 # Shared TypeScript configs
│   ├── db/                     # Supabase client + types
│   ├── shared/                 # Shared types + utilities
│   ├── ingest/                 # Dataset loading + embedding pipeline
│   ├── retrieval/              # Vector search + reranking
│   ├── agent/                  # Mastra agent definition
│   └── eval/                   # Retrieval + answer evaluation
├── supabase/
│   ├── migrations/             # SQL migrations
│   └── config.toml             # Local Supabase config
└── raw-data/                   # TechQA dataset files (gitignored)
```

## Available Scripts

### Root level

| Command | Description |
| ------- | ----------- |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Clean build artifacts |

### Database (Supabase)

| Command | Description |
| ------- | ----------- |
| `pnpm db:start` | Start local Supabase stack |
| `pnpm db:stop` | Stop local Supabase |
| `pnpm db:status` | Show running services and keys |
| `pnpm db:reset` | Reset database and run migrations |
| `pnpm db:diff` | Generate migration from schema changes |
| `pnpm db:generate-types` | Generate TypeScript types from schema |

### Package-specific

```bash
# Run smoke test for database connection
pnpm --filter @pkg/db smoke

# Inspect dataset (after Phase 1)
pnpm --filter @pkg/ingest inspect

# Run retrieval demo (after Phase 4)
pnpm --filter @pkg/retrieval demo -- "my question"

# Run evaluation (after Phase 5)
pnpm --filter @pkg/eval retrieval
```

## Local Development

### Supabase Dashboard

After running `pnpm db:start`, access the local Supabase Studio at:

<http://localhost:54323>

### Database Connection

Direct PostgreSQL connection (for tools like pgAdmin, DataGrip):

```text
postgresql://postgres:postgres@localhost:54322/postgres
```

### Workflow

1. Make schema changes in Supabase Studio or SQL
2. Generate migration: `pnpm db:diff -f my_migration_name`
3. Review migration in `supabase/migrations/`
4. Apply changes: `pnpm db:reset`
5. Generate types: `pnpm db:generate-types`

## Dataset Setup

This project uses the [TechQA dataset](https://github.com/IBM/techqa). Place the following files in `raw-data/`:

- `training_Q_A.json` - Training Q&A pairs
- `dev_Q_A.json` - Dev Q&A pairs (for evaluation)
- `training_dev_technotes.sections.json` - Pre-chunked technote sections

These files are gitignored. See `dev-docs/dataset-info.md` for dataset details.

## Troubleshooting

### Docker not running

```text
Error: Cannot connect to the Docker daemon
```

Start Docker Desktop or your container runtime.

### Port conflicts

If Supabase ports are in use:

```bash
pnpm db:stop
# Then manually stop conflicting services, or modify supabase/config.toml
pnpm db:start
```

### Database connection fails

1. Check Supabase is running: `pnpm db:status`
2. Verify `.env.local` has correct keys from `db:status` output
3. Run smoke test: `pnpm --filter @pkg/db smoke`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run checks: `pnpm build && pnpm typecheck`
5. Commit with a descriptive message
6. Open a pull request

## License

MIT
