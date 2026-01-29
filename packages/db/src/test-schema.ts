#!/usr/bin/env node
/**
 * Test the technote_sections schema - insert and query a row
 * Run with: pnpm --filter @pkg/db test-schema
 */
import { getSupabaseClient } from "./client.js";

async function main(): Promise<void> {
  console.log("Testing technote_sections schema...\n");

  const supabase = getSupabaseClient();

  // 1. Insert a test technote (parent record)
  const testTechnoteId = "test-technote-001";
  console.log("1. Inserting test technote...");

  const { error: technoteError } = await supabase.from("technotes").upsert({
    id: testTechnoteId,
    title: "Test Technote for Schema Verification",
    section_count: 1,
  });

  if (technoteError) {
    throw new Error(`Failed to insert technote: ${technoteError.message}`);
  }
  console.log("   ✓ Technote inserted");

  // 2. Insert a test section
  const testSectionId = `${testTechnoteId}#0`;
  console.log("2. Inserting test section...");

  const { error: sectionError } = await supabase
    .from("technote_sections")
    .upsert({
      id: testSectionId,
      technote_id: testTechnoteId,
      section_idx: 0,
      heading: "Introduction",
      content: "This is a test section for verifying the database schema.",
      span_start: 0,
      span_end: 58,
      // Note: embedding is null for this test (will be populated during ingestion)
    });

  if (sectionError) {
    throw new Error(`Failed to insert section: ${sectionError.message}`);
  }
  console.log("   ✓ Section inserted");

  // 3. Query the section back
  console.log("3. Querying section...");

  const { data: section, error: queryError } = await supabase
    .from("technote_sections")
    .select("*")
    .eq("id", testSectionId)
    .single();

  if (queryError) {
    throw new Error(`Failed to query section: ${queryError.message}`);
  }

  console.log("   ✓ Section retrieved:");
  console.log(`     ID: ${section.id}`);
  console.log(`     Technote: ${section.technote_id}`);
  console.log(`     Heading: ${section.heading}`);
  console.log(`     Content: ${section.content}`);
  console.log(`     Embedding: ${section.embedding ?? "(null - not yet generated)"}`);

  // 4. Clean up test data
  console.log("4. Cleaning up test data...");

  await supabase.from("technote_sections").delete().eq("id", testSectionId);
  await supabase.from("technotes").delete().eq("id", testTechnoteId);

  console.log("   ✓ Test data cleaned up");

  console.log("\n✅ Schema test passed! Database is ready for RAG.");
}

main().catch((err) => {
  console.error("❌ Schema test failed:", err);
  process.exit(1);
});
