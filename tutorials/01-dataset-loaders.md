# Phase 1 — Dataset loaders

**Checkpoint:** Can parse TechQA-lite deterministically; inspect script prints stable counts and sample records.

**Commit:** `a92390d` (TechQA loaders + inspect script).

---

## Why

RAG needs **structured, deterministic input**:

1. **Q&A data** — For evaluation we need questions and, for answerable ones, the “gold” document ID (the technote that contains the answer). We also need candidate doc IDs and answer spans.
2. **Technote sections** — The indexing unit for RAG is a **section** (e.g. a heading + content), not the whole document. We need a stable section ID (e.g. `technoteId#sectionIdx`) so we can store, retrieve, and cite sections consistently.

If we don’t normalize IDs and field names up front, we’ll hit schema surprises later (wrong gold doc id, mismatched section IDs). So in this phase we:

- Define **raw** types (exactly as in the JSON files) and **parsed** types (normalized for the app).
- Implement loaders for the Q&A files and the technote-sections file.
- Add an **inspect** script that prints counts and sample shapes so we know the data and can verify gold docs exist.

---

## What you’ll do

- **Shared types** — In `packages/shared`, define raw types (`RawQAPair`, `RawSection`, `RawTechnote`, `RawTechnotesMap`) and parsed types (`ParsedQA`, `ParsedSection`, `ParsedTechnote`) in `packages/shared/src/types/techqa.ts`.
- **Section IDs** — In `packages/shared/src/text/ids.ts`, implement `createSectionId(technoteId, sectionIdx)` (e.g. `swg123#0`) and optionally `parseSectionId` / `getTechnoteIdFromSectionId`.
- **Q&A loader** — In `packages/ingest`, implement `loadQaFile`, `loadTrainingQa`, `loadDevQa` in `packages/ingest/src/techqa/loadQa.ts`; parse each raw Q&A into `ParsedQA` (gold technote id, answer span, candidate doc ids).
- **Technote loader** — In `packages/ingest/src/techqa/loadTechnotes.ts`, implement `loadTechnotes` (returns `Map<string, ParsedTechnote>`) and `loadAllSections` (flatten all sections for indexing); use `createSectionId` for each section.
- **Inspect script** — In `packages/ingest/src/techqa/inspect.ts`, load train/dev QA and technotes/sections from a data directory, print counts (train/dev QA, answerable/unanswerable, technote count, section count, section heading distribution), print sample QA and section records, and verify that every gold technote id in the QA set exists in the technotes map.
- **Data layout** — Document where to put TechQA files (e.g. `raw-data/` at repo root) and the expected filenames: `training_Q_A.json`, `dev_Q_A.json`, `training_dev_technotes.sections.json`.

At the end, running the inspect script prints stable counts and sample records with no schema surprises.

---

## How (step-by-step)

### 1. Shared types (`packages/shared`)

**Raw types** (match the JSON exactly):

- `RawQAPair`: `QUESTION_ID`, `QUESTION_TITLE`, `QUESTION_TEXT`, `DOCUMENT` (gold doc id or "-"), `ANSWER`, `START_OFFSET`, `END_OFFSET`, `ANSWERABLE` ("Y" | "N"), `DOC_IDS` (candidate doc ids).
- `RawSection`: `text`, `id` (heading string), `start`, `end` (character offsets).
- `RawTechnote`: `id`, `text`, `title`, `sections: RawSection[]`.
- `RawTechnotesMap`: `Record<string, RawTechnote>` (technotes file is keyed by id).

**Parsed types** (normalized for the app):

- `ParsedSection`: `id` (stable `technoteId#sectionIdx`), `technoteId`, `sectionIdx`, `heading`, `content`, `span: { start, end }`.
- `ParsedTechnote`: `id`, `title`, `fullText`, `sections: ParsedSection[]`.
- `ParsedQA`: `id`, `title`, `question` (title + body, deduped), `answer`, `answerable`, `goldTechnoteId` (null if unanswerable), `answerSpan` (null if unanswerable), `candidateDocIds`.

Export these from `packages/shared/src/index.ts`.

---

### 2. Section ID helpers (`packages/shared/src/text/ids.ts`)

- `createSectionId(technoteId, sectionIdx)` → `"${technoteId}#${sectionIdx}"`.
- Optionally: `parseSectionId(sectionId)` → `{ technoteId, sectionIdx } | null`; `getTechnoteIdFromSectionId(sectionId)` → technote id or null.

These keep section IDs stable and parseable everywhere (ingest, retrieval, citations).

---

### 3. Ingest package setup

Create `packages/ingest/package.json` with:

- `"name": "@pkg/ingest"`, `"type": "module"`.
- Dependencies: `@pkg/db`, `@pkg/shared`.
- DevDependencies: `@pkg/config`, `tsx`, `typescript`, `@types/node`.
- Scripts: `build`, `typecheck`, `clean`, `inspect` (e.g. `node --import tsx ./src/techqa/inspect.ts`).

Create `packages/ingest/tsconfig.json` extending `@pkg/config/tsconfig.base.json`. Create `packages/ingest/src/index.ts` that re-exports from `techqa/loadQa`, `techqa/loadTechnotes`, etc.

---

### 4. Q&A loader (`packages/ingest/src/techqa/loadQa.ts`)

- `parseQA(raw: RawQAPair): ParsedQA`:
  - `answerable = raw.ANSWERABLE === "Y"`.
  - Build `question`: combine title and body, avoid duplicating title if body starts with it.
  - `goldTechnoteId`: answerable ? `raw.DOCUMENT` : null.
  - `answerSpan`: answerable ? `{ start: parseInt(raw.START_OFFSET, 10), end: parseInt(raw.END_OFFSET, 10) }` : null.
  - `candidateDocIds`: `raw.DOC_IDS`.
- `loadQaFile(filePath: string): Promise<ParsedQA[]>` — read file, `JSON.parse`, map with `parseQA`.
- `loadTrainingQa(dataDir: string)` → `loadQaFile(\`${dataDir}/training_Q_A.json\`)`.
- `loadDevQa(dataDir: string)` → `loadQaFile(\`${dataDir}/dev_Q_A.json\`)`.

---

### 5. Technote loader (`packages/ingest/src/techqa/loadTechnotes.ts`)

- For each raw technote, map `raw.sections` to `ParsedSection[]` with:
  - `id: createSectionId(raw.id, idx)`,
  - `technoteId: raw.id`, `sectionIdx: idx`, `heading: section.id`, `content: section.text`, `span: { start: section.start, end: section.end }`.
- `loadTechnotes(filePath: string): Promise<Map<string, ParsedTechnote>>` — read JSON (`RawTechnotesMap`), build a `Map` of `ParsedTechnote` keyed by id.
- `loadAllSections(filePath: string): Promise<ParsedSection[]>` — call `loadTechnotes`, then flatten all `technote.sections` into one array (this is the primary list for ingestion).
- `loadTechnotesFromDir(dataDir: string)` → load from `${dataDir}/training_dev_technotes.sections.json`.

---

### 6. Inspect script (`packages/ingest/src/techqa/inspect.ts`)

- Resolve **data directory**: e.g. `raw-data` at repo root (from the script’s location: `../../../../raw-data` if the script lives under `packages/ingest/src/techqa/`). Document this in the README.
- Load **training and dev QA** with `loadTrainingQa(DATA_DIR)` and `loadDevQa(DATA_DIR)`.
- Print **counts**: total train/dev QA, answerable vs unanswerable for each.
- Print **sample records**: one answerable QA, one unanswerable QA (id, title, answerable, gold doc, answer span, candidate count).
- Load **technotes** with `loadTechnotesFromDir(DATA_DIR)` and **all sections** with `loadAllSections(\`${DATA_DIR}/training_dev_technotes.sections.json\`)`.
- Print **counts**: technotes size, total sections, avg sections per technote.
- Print **section heading distribution** (top N headings by count).
- Print **sample technote** and **sample section** (id, technoteId, heading, content preview).
- **Verify gold docs**: for each QA with a `goldTechnoteId`, check that `technotes.has(goldTechnoteId)`. Report how many QA entries reference a missing technote and list a few missing ids.

Run with something like:  
`pnpm --filter @pkg/ingest inspect`  
(ensure `raw-data/` exists and contains the three JSON files).

---

### 7. Data layout

- Create a directory for TechQA data (e.g. `raw-data/` at repo root). Add `raw-data/` to `.gitignore` if the files are large or private.
- Document in README: place `training_Q_A.json`, `dev_Q_A.json`, and `training_dev_technotes.sections.json` in `raw-data/` (or the path your inspect script uses). You can obtain these from the IBM TechQA dataset or the project’s expected layout.

---

## Checkpoint

- Running the inspect script (e.g. `pnpm --filter @pkg/ingest inspect`) prints **stable counts** and **sample records**.
- No schema surprises: you know the exact field names for gold doc id, section text, and section id format.
- Verification step shows either “All gold documents exist in technotes” or a clear count of missing gold docs.

---

## Commit reference

- `a92390d` — Add TechQA loaders and inspection tool for dataset analysis.

---

## Next

Go to [02-supabase-schema.md](02-supabase-schema.md) to add the Supabase schema and vector index (technotes, technote_sections, qa_dev, HNSW).
