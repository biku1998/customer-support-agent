/**
 * Grounded answer generation
 *
 * Generates answers from context using an LLM, with citations
 */
import OpenAI from "openai";
import type { SearchResult } from "@pkg/retrieval";
import {
  GROUNDED_ANSWER_SYSTEM_PROMPT,
  buildUserMessage,
  type ContextSection,
} from "./prompts/answer.js";
import {
  validateCitations,
  type CitationValidationResult,
} from "./validators/citation.js";

export interface GenerateAnswerOptions {
  /** OpenAI model to use */
  model?: string;
  /** Temperature for generation (0 = deterministic) */
  temperature?: number;
  /** Maximum tokens for the response */
  maxTokens?: number;
}

export interface GeneratedAnswer {
  /** The generated answer text */
  answer: string;
  /** Citation validation result */
  citationValidation: CitationValidationResult;
  /** The section IDs that were provided as context */
  contextSectionIds: string[];
  /** Usage stats from the API */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const defaultOptions: Required<GenerateAnswerOptions> = {
  model: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 1024,
};

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

/**
 * Convert SearchResult to ContextSection for the prompt
 */
function searchResultToContext(result: SearchResult): ContextSection {
  return {
    id: result.id,
    technoteId: result.technoteId,
    heading: result.heading,
    content: result.content,
  };
}

/**
 * Generate a grounded answer from retrieved sections
 */
export async function generateAnswer(
  question: string,
  retrievedSections: SearchResult[],
  options: GenerateAnswerOptions = {}
): Promise<GeneratedAnswer> {
  const { model, temperature, maxTokens } = { ...defaultOptions, ...options };
  const openai = getOpenAIClient();

  // Convert to context sections
  const contextSections = retrievedSections.map(searchResultToContext);
  const contextSectionIds = contextSections.map((s) => s.id);

  // Build the prompt
  const userMessage = buildUserMessage(question, contextSections);

  // Call the API
  const response = await openai.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: GROUNDED_ANSWER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const answer = response.choices[0]?.message?.content ?? "";

  // Validate citations
  const citationValidation = validateCitations(answer, contextSectionIds);

  return {
    answer,
    citationValidation,
    contextSectionIds,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Generate answer with retrieval (convenience function that combines retrieval + generation)
 */
export async function answerQuestion(
  supabase: Parameters<typeof import("@pkg/retrieval").searchSections>[0],
  question: string,
  options: GenerateAnswerOptions & { topK?: number } = {}
): Promise<GeneratedAnswer & { retrievedSections: SearchResult[] }> {
  // Dynamic import to avoid circular dependency issues
  const { searchSections } = await import("@pkg/retrieval");

  const topK = options.topK ?? 5;
  const retrievedSections = await searchSections(supabase, question, { topK });

  const result = await generateAnswer(question, retrievedSections, options);

  return {
    ...result,
    retrievedSections,
  };
}
