#!/usr/bin/env node
/**
 * Demo script for testing retrieval
 *
 * Usage:
 *   pnpm --filter @pkg/retrieval demo
 *   pnpm --filter @pkg/retrieval demo -- "How do I troubleshoot network issues?"
 *   pnpm --filter @pkg/retrieval demo -- "password reset" --top-k 10
 */
import { parseArgs } from "node:util";
import { getSupabaseClient } from "@pkg/db";
import { searchSections } from "../src/search.js";

const DEFAULT_QUERY = "How do I troubleshoot network connection issues?";

function parseOptions() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  const { values, positionals } = parseArgs({
    args,
    options: {
      "top-k": { type: "string", short: "k", default: "5" },
    },
    allowPositionals: true,
  });

  return {
    query: positionals[0] ?? DEFAULT_QUERY,
    topK: parseInt(values["top-k"] ?? "5", 10),
  };
}

function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

async function main(): Promise<void> {
  const { query, topK } = parseOptions();

  console.log("Retrieval Demo");
  console.log("=".repeat(60));
  console.log(`Query: "${query}"`);
  console.log(`Top-K: ${topK}`);
  console.log("");

  const supabase = getSupabaseClient();

  // Measure latency
  const startTime = Date.now();
  const results = await searchSections(supabase, query, { topK });
  const latency = Date.now() - startTime;

  console.log(`Found ${results.length} results in ${latency}ms\n`);
  console.log("-".repeat(60));

  for (const result of results) {
    console.log(`\nID: ${result.id}`);
    console.log(`Technote: ${result.technoteId}`);
    console.log(`Similarity: ${result.similarity.toFixed(4)}`);
    if (result.heading) {
      console.log(`Heading: ${result.heading}`);
    }
    console.log(`Content: ${truncate(result.content)}`);
  }

  console.log("\n" + "-".repeat(60));
  console.log(`\nLatency: ${latency}ms`);
}

main().catch((err) => {
  console.error("\nRetrieval demo failed:", err);
  process.exit(1);
});
