#!/usr/bin/env node
/**
 * Demo script for answer generation
 *
 * Usage:
 *   pnpm --filter @pkg/agent demo -- "your question here"
 */
import { getSupabaseClient } from "@pkg/db";
import { answerQuestion } from "../src/generateAnswer.js";

async function main(): Promise<void> {
  const question = process.argv[2];

  if (!question) {
    console.error("Usage: pnpm --filter @pkg/agent demo -- \"your question\"");
    process.exit(1);
  }

  console.log("Question:", question);
  console.log("=".repeat(60));
  console.log("");

  const supabase = getSupabaseClient();

  const result = await answerQuestion(supabase, question, { topK: 5 });

  console.log("Retrieved Sections:");
  console.log("-".repeat(60));
  for (const section of result.retrievedSections) {
    console.log(`  [${section.id}] ${section.heading ?? "(no heading)"}`);
    console.log(`    Similarity: ${section.similarity.toFixed(4)}`);
    console.log(`    Preview: ${section.content.slice(0, 100)}...`);
    console.log("");
  }

  console.log("Answer:");
  console.log("-".repeat(60));
  console.log(result.answer);
  console.log("");

  console.log("Citation Validation:");
  console.log("-".repeat(60));
  console.log(`  Valid: ${result.citationValidation.isValid}`);
  console.log(`  Citation count: ${result.citationValidation.citationCount}`);
  console.log(`  Valid citations: ${result.citationValidation.validCitations.join(", ") || "(none)"}`);
  console.log(`  Invalid citations: ${result.citationValidation.invalidCitations.join(", ") || "(none)"}`);
  console.log(`  Is abstention: ${result.citationValidation.isAbstention}`);
  console.log("");

  console.log("Usage:");
  console.log("-".repeat(60));
  console.log(`  Prompt tokens: ${result.usage.promptTokens}`);
  console.log(`  Completion tokens: ${result.usage.completionTokens}`);
  console.log(`  Total tokens: ${result.usage.totalTokens}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
