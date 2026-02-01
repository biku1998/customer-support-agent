# Phase 7 — Mastra agent wiring

**Checkpoint:** Mastra console can run end-to-end; in Mastra playground/studio you see tool calls, retrieved passages, and final answer with citations.

**Commit:** `f220730` (Customer Support Copilot agent, retrieve tool, test-agent).

---

## Why

We want an **end-to-end experience** where a user asks a question and the system:

1. **Retrieves** relevant sections from the knowledge base (via a tool).
2. **Answers** using only that context and **cites** section IDs.
3. **Abstains** when retrieval returns nothing or when context is insufficient.

**Mastra** gives us an agent framework with tools, instructions, and observability (tracing, playground). By wiring a **retrieve** tool and clear **instructions**, the agent will call the tool first, then generate an answer with citations. We can then run it in Mastra Studio and later from a chat UI (Phase 9).

---

## What you’ll do

- **Retrieve tool** — In `packages/agent/src/tools/retrieve.tool.ts`, create a Mastra tool with id `"retrieve"`, input schema (query: string, optional topK: number), and output schema (sections array, formattedContext string, count). In execute: get Supabase client, call `searchSections(supabase, query, { topK })`, format results for the LLM (e.g. each section as `[id]\n## heading\ncontent`), and return { sections, formattedContext, count }.
- **Copilot agent** — In `packages/agent/src/copilot.agent.ts`, create a Mastra Agent with instructions that tell the model to: always retrieve first when the user asks a technical question; answer only from retrieved context; include inline citations [section_id]; handle no results gracefully (say you couldn’t find relevant docs). Set model (e.g. openai/gpt-4o-mini) and tools: { retrieve: retrieveTool }.
- **Mastra index** — In `packages/agent/src/mastra/index.ts` (or equivalent), export the agent and tools so Mastra Studio can discover them.
- **Test script** — In `packages/agent/bin/test-agent.ts`, run the agent with a sample question (e.g. “How do I reset my password in Tivoli Storage Manager?”), print tool calls and the final answer so you can verify the flow without opening the playground.

At the end, in Mastra playground/studio you can chat and see tool calls, retrieved passages, and final answer with citations.

---

## How (step-by-step)

### 1. Mastra and tool dependencies

- Add `@mastra/core` (or the Mastra package that provides Agent and createTool) and `zod` to `packages/agent` dependencies. Ensure `@pkg/db` and `@pkg/retrieval` are available.

---

### 2. Retrieve tool (`packages/agent/src/tools/retrieve.tool.ts`)

- Use Mastra’s `createTool` (or equivalent) with:
  - **id:** `"retrieve"`.
  - **description:** Explain that this tool searches the technical support knowledge base for sections relevant to the user’s question; use it before answering technical questions; it returns section IDs for citation.
  - **inputSchema (Zod):** `query: z.string()`, `topK: z.number().int().min(1).max(20).optional()` (default e.g. 5).
  - **outputSchema:** e.g. `sections: z.array(z.object({ id, technoteId, heading, content, similarity }))`, `formattedContext: z.string()`, `count: z.number()`.
- **execute:** Get Supabase client with `getSupabaseClient()`. Call `searchSections(supabase, input.query, { topK: input.topK ?? 5 })`. Format each result for the LLM: e.g. `[${result.id}]\n## ${result.heading}\n\n${result.content}` and join with `\n\n---\n\n`. Return { sections: array of { id, technoteId, heading, content, similarity }, formattedContext: the joined string, count: results.length }.

Export the tool as `retrieveTool`.

---

### 3. Copilot agent (`packages/agent/src/copilot.agent.ts`)

- **Instructions:** Write clear system instructions that:
  - You are a technical support copilot for IBM software products with access to a knowledge base.
  - **Workflow:** When the user asks a technical question, always use the retrieve tool first to search for relevant documentation sections.
  - Answer **only** from the sections returned by the retrieve tool; do not use prior knowledge.
  - Include **inline citations** for every factual claim using the section ID in square brackets: [section_id].
  - **Handle insufficient context:** If retrieve returns no results, tell the user you couldn’t find relevant documentation. If results don’t fully answer the question, say what you can and cannot answer. Never make up information.
  - Give **citation format** examples (e.g. “You need to install version 3.1.2.1 or later [swg24042191#2].”).
  - Be concise but thorough; use technical terminology accurately; format steps as numbered lists; highlight commands in code blocks.
- **Agent config:** Use Mastra’s Agent constructor with `id: "support-copilot"`, `name: "Customer Support Copilot"`, `instructions`, `model: "openai/gpt-4o-mini"` (or your model string), `tools: { retrieve: retrieveTool }`.

Export the agent as `copilotAgent`.

---

### 4. Mastra index (`packages/agent/src/mastra/index.ts`)

- Export the agent and tools so that Mastra Studio (or your app) can import a single entry point. For example: export `copilotAgent` and `retrieveTool` from the agent and tools modules. If your Mastra setup expects a specific structure (e.g. an array of agents), follow that.

---

### 5. Test script (`packages/agent/bin/test-agent.ts`)

- Load env from `../../.env.local` (via `--env-file` in the script).
- Import the copilot agent. Run the agent with a sample message (e.g. “How do I reset my password in Tivoli Storage Manager?”) using the Mastra API (e.g. `agent.generate()` or equivalent).
- Print or log: the raw response, tool calls (if exposed), and the final text answer. This verifies that the agent calls the retrieve tool and returns an answer with citations without needing the UI.

Add a script in `packages/agent/package.json`: e.g. `"test-agent": "node --env-file=../../.env.local --import tsx ./bin/test-agent.ts"`.

---

## Checkpoint

- In **Mastra playground/studio**, you can start a chat and ask a technical question. You see:
  - A **tool call** to retrieve with the question (or a derived query).
  - **Retrieved passages** (or the formattedContext) in the tool result.
  - A **final answer** with inline citations like [swg123#0].
- When you ask something off-topic or with no relevant docs, the agent **abstains** or says it couldn’t find relevant documentation.
- **test-agent** script runs and prints a plausible answer with citations.

---

## Commit reference

- `f220730` — feat: add Customer Support Copilot agent with retrieval tool.

---

## Next

Go to [08-regression-suite.md](08-regression-suite.md) to add the regression suite (golden set, thresholds, regression runner).
