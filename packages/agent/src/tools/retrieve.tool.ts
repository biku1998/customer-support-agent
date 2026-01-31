/**
 * Retrieve tool for Mastra agent
 *
 * Searches the knowledge base for relevant technote sections
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSupabaseClient } from "@pkg/db";
import { searchSections, type SearchResult } from "@pkg/retrieval";

/** Default number of sections to retrieve */
const DEFAULT_TOP_K = 5;

/**
 * Format a single search result for the agent context
 */
function formatSection(result: SearchResult): string {
  const heading = result.heading ? `## ${result.heading}\n\n` : "";
  return `[${result.id}]\n${heading}${result.content}`;
}

/**
 * Format all search results as context for the agent
 */
function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant sections found in the knowledge base.";
  }

  return results.map(formatSection).join("\n\n---\n\n");
}

/**
 * Retrieve tool - searches the knowledge base for relevant sections
 */
export const retrieveTool = createTool({
  id: "retrieve",
  description:
    "Search the technical support knowledge base for sections relevant to the user's question. " +
    "Use this tool to find context before answering technical questions. " +
    "The tool returns the most relevant documentation sections with their IDs for citation.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query - typically the user's question or key terms"),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of sections to retrieve (default: 5)"),
  }),
  outputSchema: z.object({
    sections: z.array(
      z.object({
        id: z.string().describe("Section ID for citation"),
        technoteId: z.string().describe("Parent technote ID"),
        heading: z.string().nullable().describe("Section heading if available"),
        content: z.string().describe("Section content"),
        similarity: z.number().describe("Relevance score (0-1)"),
      })
    ),
    formattedContext: z
      .string()
      .describe("Formatted context ready for LLM consumption"),
    count: z.number().describe("Number of sections returned"),
  }),
  execute: async (input) => {
    const { query, topK = DEFAULT_TOP_K } = input;

    // Get supabase client
    const supabase = getSupabaseClient();

    // Search for relevant sections
    const results = await searchSections(supabase, query, { topK });

    return {
      sections: results.map((r) => ({
        id: r.id,
        technoteId: r.technoteId,
        heading: r.heading,
        content: r.content,
        similarity: r.similarity,
      })),
      formattedContext: formatResults(results),
      count: results.length,
    };
  },
});
