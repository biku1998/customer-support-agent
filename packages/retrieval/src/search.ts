/**
 * Vector similarity search for technote sections
 */
import type { TypedSupabaseClient } from "@pkg/db";
import { embedQuery } from "./embedQuery.js";

export interface SearchResult {
  id: string;
  technoteId: string;
  sectionIdx: number;
  heading: string | null;
  content: string;
  similarity: number;
}

export interface SearchOptions {
  topK?: number;
  filterTechnoteId?: string | null;
}

const defaultOptions: Required<SearchOptions> = {
  topK: 5,
  filterTechnoteId: null,
};

/**
 * Search for similar sections given a query string
 * Uses the match_sections RPC function for vector similarity search
 */
export async function searchSections(
  supabase: TypedSupabaseClient,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { topK, filterTechnoteId } = { ...defaultOptions, ...options };

  // 1. Embed the query
  const queryEmbedding = await embedQuery(query);

  // 2. Call the match_sections RPC
  const { data, error } = await supabase.rpc("match_sections", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_count: topK,
    filter_technote_id: filterTechnoteId ?? undefined,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  // 3. Transform results
  return (data ?? []).map((row) => ({
    id: row.id,
    technoteId: row.technote_id,
    sectionIdx: row.section_idx,
    heading: row.heading,
    content: row.content,
    // Convert cosine distance to similarity score (1 - distance)
    similarity: 1 - row.similarity,
  }));
}

/**
 * Search with raw embedding (skip embedding step if you already have it)
 */
export async function searchWithEmbedding(
  supabase: TypedSupabaseClient,
  embedding: number[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { topK, filterTechnoteId } = { ...defaultOptions, ...options };

  const { data, error } = await supabase.rpc("match_sections", {
    query_embedding: `[${embedding.join(",")}]`,
    match_count: topK,
    filter_technote_id: filterTechnoteId ?? undefined,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    technoteId: row.technote_id,
    sectionIdx: row.section_idx,
    heading: row.heading,
    content: row.content,
    similarity: 1 - row.similarity,
  }));
}
