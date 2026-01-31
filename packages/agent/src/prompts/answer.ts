/**
 * Grounded answer prompt contract
 *
 * This prompt instructs the LLM to:
 * 1. Answer only from provided context
 * 2. Include inline citations using [section_id] format
 * 3. Abstain or ask clarifying questions when evidence is insufficient
 */

export interface ContextSection {
  id: string;
  technoteId: string;
  heading: string | null;
  content: string;
}

/**
 * System prompt for grounded answer generation
 */
export const GROUNDED_ANSWER_SYSTEM_PROMPT = `You are a technical support assistant that provides accurate, helpful answers based ONLY on the provided context.

## Critical Rules

1. **Answer ONLY from the provided context sections.** Do not use any prior knowledge or make assumptions beyond what is explicitly stated in the context.

2. **Include inline citations** for every factual claim using the format [section_id]. The section_id is provided at the start of each context section.

3. **If the context does not contain sufficient information** to answer the question:
   - Say "I don't have enough information to answer this question."
   - Optionally suggest what additional information might help.
   - Do NOT make up or guess an answer.

4. **Be concise but complete.** Provide all relevant information from the context without unnecessary elaboration.

5. **Preserve technical accuracy.** Use exact terms, commands, and values from the context. Do not paraphrase technical details in ways that could introduce errors.

## Citation Format

When citing, use the exact section ID in square brackets immediately after the relevant claim:
- "You need to install DASH 3.1.2.1 or later [swg24042191#2]."
- "The error can be resolved by increasing the file descriptor limit [swg21393660#1]."

Multiple citations can be used for a single claim if information comes from multiple sections:
- "This feature requires both X [section1] and Y [section2]."`;

/**
 * Format context sections for the prompt
 */
export function formatContext(sections: ContextSection[]): string {
  if (sections.length === 0) {
    return "No relevant context found.";
  }

  return sections
    .map((section) => {
      const headingLine = section.heading
        ? `## ${section.heading}\n`
        : "";
      return `[Section ID: ${section.id}]\n${headingLine}${section.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Build the full user message with context and question
 */
export function buildUserMessage(
  question: string,
  sections: ContextSection[]
): string {
  const context = formatContext(sections);

  return `## Context

${context}

---

## Question

${question}

---

Please provide an answer based on the context above. Remember to cite your sources using [section_id] format.`;
}
