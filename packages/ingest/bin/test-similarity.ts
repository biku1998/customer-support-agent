#!/usr/bin/env node
/**
 * Test similarity search on ingested sections
 *
 * Usage:
 *   pnpm --filter @pkg/ingest test-similarity
 *   pnpm --filter @pkg/ingest test-similarity -- "How do I reset my password?"
 */
import { getSupabaseClient } from "@pkg/db";
import { createEmbedding } from "../src/embeddings/embed.js";
import { getSectionCount } from "../src/upsert/upsertSections.js";

const DEFAULT_QUERY = "How do I troubleshoot network connection issues?";

async function main(): Promise<void> {
  const query = process.argv[2] ?? DEFAULT_QUERY;
  const topK = 5;

  console.log("Similarity Search Test");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Check we have data
  const count = await getSectionCount(supabase);
  if (count === 0) {
    console.log("\nNo sections in database. Run ingestion first:");
    console.log("  pnpm --filter @pkg/ingest ingest -- --limit 1000");
    process.exit(1);
  }
  console.log(`Database has ${count} sections\n`);

  // Generate query embedding
  console.log(`Query: "${query}"\n`);
  console.log("Generating query embedding...");

  const queryEmbedding = await createEmbedding(query);
  console.log(`Embedding dimension: ${queryEmbedding.length}\n`);

  // Perform similarity search using pgvector
  console.log(`Searching for top ${topK} similar sections...\n`);

  const { data: results, error } = await supabase.rpc("match_sections", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_count: topK,
  });

  if (error) {
    // If RPC doesn't exist, fall back to raw SQL via REST
    console.log("Note: Using direct query (RPC not set up yet)\n");

    const { data, error: queryError } = await supabase
      .from("technote_sections")
      .select("id, technote_id, heading, content")
      .not("embedding", "is", null)
      .limit(topK);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    console.log("Results (note: not similarity-ranked without RPC):");
    console.log("-".repeat(60));
    for (const row of data ?? []) {
      console.log(`\nID: ${row.id}`);
      console.log(`Heading: ${row.heading}`);
      console.log(`Content: ${row.content?.slice(0, 200)}...`);
    }
    console.log("\n" + "-".repeat(60));
    console.log("\nTo enable proper similarity search, add the match_sections RPC.");
    return;
  }

  // Display results
  console.log("Results:");
  console.log("-".repeat(60));

  for (const result of results ?? []) {
    console.log(`\nID: ${result.id}`);
    console.log(`Similarity: ${(1 - result.similarity).toFixed(4)}`);
    console.log(`Heading: ${result.heading}`);
    console.log(`Content: ${result.content?.slice(0, 200)}...`);
  }

  console.log("\n" + "-".repeat(60));
  console.log("\nSimilarity search complete!");
}

main().catch((err) => {
  console.error("\nSimilarity search failed:", err);
  process.exit(1);
});
