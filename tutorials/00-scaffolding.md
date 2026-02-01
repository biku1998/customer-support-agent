# Phase 0 — Project scaffolding

**Checkpoint:** Repo boots; Supabase connection works.

**Commits:** `ad6fb5a` (Supabase config + workspace setup), `87311e8` (.gitignore + README).

---

## Why

Before writing any RAG or agent code, we need:

1. A **reproducible environment** — one way to install dependencies and run scripts across ingestion, retrieval, agent, and eval.
2. **Shared TypeScript config** — so every package compiles and type-checks the same way.
3. **Local Supabase** — a real Postgres + API we can use without a hosted account.
4. **A way to verify** that the repo “boots” and that we can talk to the database.

A **pnpm monorepo** with workspaces gives us one root and multiple packages (`db`, `shared`, then later `ingest`, `retrieval`, `agent`, `eval`). Supabase CLI gives us `supabase init` and `supabase start` for local development. A **smoke script** that connects to Supabase and runs a simple query proves the setup works.

---

## What you’ll do

- Create the **monorepo**: root `package.json`, `pnpm-workspace.yaml`, and workspace packages.
- Add **shared config**: `packages/config` with `tsconfig.base.json` and `tsconfig.node.json` that other packages extend.
- Add **packages/db**: Supabase client, typed with a `Database` type, and a **smoke script** that runs `select`-style check against Supabase.
- Add **packages/shared**: minimal exports (types and text utilities) so other packages can depend on shared types.
- Add **env management**: `.env.example` listing required variables; scripts use `.env.local` (gitignored).
- **Initialize Supabase**: `supabase init` (creates `supabase/` with `config.toml`), then `supabase start` to run the local stack.

At the end of this phase, `pnpm -r build` (or lint) passes and the smoke script succeeds when run against local Supabase.

---

## How (step-by-step)

### 1. Root package and workspaces

At the repo root, create `package.json`:

```json
{
  "name": "customer-support-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r clean",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:status": "supabase status",
    "db:reset": "supabase db reset",
    "db:diff": "supabase db diff",
    "db:generate-types": "supabase gen types typescript --local > packages/db/src/database.types.ts"
  },
  "devDependencies": {
    "supabase": "^2.72.9",
    "typescript": "^5.7.3"
  },
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=20"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

From the root, run `pnpm install` so the root has `supabase` and `typescript` available.

---

### 2. Shared TypeScript config

Create `packages/config/package.json`:

```json
{
  "name": "@pkg/config",
  "version": "0.0.0",
  "private": true
}
```

Create `packages/config/tsconfig.base.json` (shared compiler options):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

Create `packages/config/tsconfig.node.json` for Node scripts (e.g. bins):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": false,
    "outDir": "dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Other packages will extend `@pkg/config` so all use the same strictness and module settings.

---

### 3. Package: `db`

The `db` package owns the Supabase client and types. Later we’ll generate `database.types.ts` from the local DB; for Phase 0 you can use a **minimal stub** so the client is typed (e.g. `public.Tables` empty or with a placeholder). After Phase 2 you’ll run `pnpm db:generate-types` to replace it with the real schema.

Create `packages/db/package.json`:

```json
{
  "name": "@pkg/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./types": { "types": "./dist/database.types.d.ts", "import": "./dist/database.types.js" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "smoke": "node --env-file=../../.env.local --import tsx ./src/smoke.ts",
    "test-schema": "node --env-file=../../.env.local --import tsx ./src/test-schema.ts"
  },
  "dependencies": { "@supabase/supabase-js": "^2.48.1" },
  "devDependencies": {
    "@pkg/config": "workspace:*",
    "@types/node": "^22.13.1",
    "dotenv": "^17.2.3",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

Create `packages/db/tsconfig.json` extending the shared config and pointing to `src`:

```json
{
  "extends": "@pkg/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

**Client** — `packages/db/src/client.ts`:

- Read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) from `process.env`.
- Create a singleton Supabase client with `createClient<Database>(url, key)`.
- Export `getSupabaseClient()` and `createClient`, and a type `TypedSupabaseClient = SupabaseClient<Database>`.

Example:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | null = null;

export function getSupabaseClient(): TypedSupabaseClient {
  if (client) return client;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url) throw new Error("SUPABASE_URL environment variable is required");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required");
  client = createClient<Database>(url, key);
  return client;
}

export { createClient };
```

**Database types stub** — For Phase 0, `packages/db/src/database.types.ts` can be a minimal `Database` with empty `public.Tables` (or a single stub table). After you run migrations in Phase 2, replace this file by running:

```bash
pnpm db:generate-types
```

**Index** — `packages/db/src/index.ts`: export the client, `TypedSupabaseClient`, and the types you need from `database.types.ts` (e.g. `Database`, `Tables`, `TablesInsert`).

**Smoke script** — `packages/db/src/smoke.ts`:

- Load env (e.g. via `--env-file=../../.env.local` when run with `node`).
- Create a Supabase client with `SUPABASE_URL` and the key.
- Run a simple query that hits the API (e.g. `supabase.from("_test").select("*").limit(0)`). The table `_test` doesn’t exist; we only care that the **connection** works. So: if the error is “table/relation not found” (e.g. PGRST116 or 42P01), treat that as success; otherwise fail.
- Log success and exit 0, or log failure and exit 1.

Example (concept):

```ts
const { error } = await supabase.from("_test").select("*").limit(0);
const tableNotFoundErrors = ["PGRST116", "42P01"];
const ok = error && tableNotFoundErrors.includes(error.code);
if (!ok && error) { console.error("Connection failed:", error.message); process.exit(1); }
console.log("✅ Supabase connection successful!");
```

Run the smoke script with env loaded (as in the `smoke` script in package.json):  
`node --env-file=../../.env.local --import tsx ./src/smoke.ts`  
or from repo root:  
`pnpm --filter @pkg/db smoke`

---

### 4. Package: `shared`

Other packages will depend on `@pkg/shared` for types (e.g. TechQA raw/parsed types) and text helpers (e.g. section IDs). In Phase 0 we only need the package and minimal exports; Phase 1 will add the real TechQA types and loaders.

Create `packages/shared/package.json` with `exports` for the main entry and (optionally) `./types/*` and `./text/*`. Add a `build` script that runs `tsc`.

Create `packages/shared/tsconfig.json` extending `@pkg/config/tsconfig.base.json`, with `outDir: "dist"` and `rootDir: "src"`.

Create `packages/shared/src/index.ts` that re-exports types and text utilities. For Phase 0 you can export stub types from `packages/shared/src/types/techqa.ts` (e.g. empty interfaces or minimal RawQAPair / ParsedSection) and `packages/shared/src/text/ids.ts` (e.g. `createSectionId(technoteId, sectionIdx) => \`${technoteId}#${sectionIdx}\``) so that `db` and future `ingest` don’t need to change when you add the full types in Phase 1.

---

### 5. Environment and Supabase init

**`.env.example`** (at repo root) — list all required and optional variables so someone cloning the repo knows what to set:

```bash
# Supabase Local Development (values from `supabase start`)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI API (for embeddings)
OPENAI_API_KEY=your-openai-api-key-here
```

Copy this to `.env.local` and fill in the values. Add `.env.local` to `.gitignore`.

**Supabase:**

- From repo root: `pnpm supabase init`. This creates `supabase/` with `config.toml` and `migrations/`.
- Start the local stack: `pnpm supabase start` (or `pnpm db:start`). On first run it may download Docker images.
- In the output you’ll see `API URL`, `anon key`, and `service_role key`. Put them in `.env.local` as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

Then run the smoke script again:  
`pnpm --filter @pkg/db smoke`  
You should see “Supabase connection successful!”

---

### 6. .gitignore and README

- **.gitignore**: Add `node_modules/`, `dist/`, `.env.local`, `supabase/.branches`, `supabase/.temp`, and any other local or generated paths. Ignore `raw-data/` if you’ll put TechQA data there.
- **README.md**: Short description of the project, how to install (`pnpm install`), how to start Supabase (`pnpm db:start`), how to run the smoke test (`pnpm --filter @pkg/db smoke`), and pointer to `.env.example`.

---

## Checkpoint

- From repo root, `pnpm install` and `pnpm -r build` (or `pnpm -r typecheck`) **pass**.
- `pnpm supabase start` brings up the local stack; `pnpm --filter @pkg/db smoke` prints **Supabase connection successful!**

---

## Commit reference

- `ad6fb5a` — Add Supabase configuration and workspace setup (monorepo, config, db, shared, smoke, supabase init, .env.example).
- `87311e8` — Update .gitignore and add README.md.

---

## Next

Go to [01-dataset-loaders.md](01-dataset-loaders.md) to add TechQA loaders and the inspect script.
