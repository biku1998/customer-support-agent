#!/usr/bin/env node
/**
 * Main ingestion script for TechQA dataset
 *
 * Usage:
 *   pnpm --filter @pkg/ingest ingest              # Ingest all sections
 *   pnpm --filter @pkg/ingest ingest -- --limit 1000  # Ingest first 1000 sections
 *   pnpm --filter @pkg/ingest ingest -- --limit 5000  # Ingest first 5000 sections
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getSupabaseClient } from "@pkg/db";
import { loadTechnotesFromDir, loadAllSections } from "../src/techqa/loadTechnotes.js";
import { createEmbeddings } from "../src/embeddings/embed.js";
import {
  upsertTechnotes,
  upsertSections,
  getSectionCount,
  getTechnoteCount,
} from "../src/upsert/upsertSections.js";
import type { ParsedTechnote, ParsedSection } from "@pkg/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../../raw-data");

interface IngestOptions {
  limit?: number;
  embeddingBatchSize: number;
  upsertBatchSize: number;
}

function parseOptions(): IngestOptions {
  // Skip first two args (node and script path) and filter out standalone "--"
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  const { values } = parseArgs({
    args,
    options: {
      limit: { type: "string", short: "l" },
      "embedding-batch": { type: "string", default: "100" },
      "upsert-batch": { type: "string", default: "100" },
    },
    allowPositionals: true,
  });

  return {
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    embeddingBatchSize: parseInt(values["embedding-batch"] ?? "100", 10),
    upsertBatchSize: parseInt(values["upsert-batch"] ?? "100", 10),
  };
}

function progressBar(current: number, total: number, width: number = 30): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${current}/${total}`;
}

async function main(): Promise<void> {
  const options = parseOptions();

  console.log("TechQA Ingestion Pipeline");
  console.log("=".repeat(60));
  console.log(`Data directory: ${DATA_DIR}`);
  if (options.limit) {
    console.log(`Limiting to first ${options.limit} sections`);
  }
  console.log("");

  // 1. Load data
  console.log("1. Loading technotes and sections...");
  const technotesMap = await loadTechnotesFromDir(DATA_DIR);
  let allSections = await loadAllSections(`${DATA_DIR}/training_dev_technotes.sections.json`);

  console.log(`   Loaded ${technotesMap.size} technotes, ${allSections.length} sections`);

  // 2. Apply limit if specified
  if (options.limit && options.limit < allSections.length) {
    allSections = allSections.slice(0, options.limit);
    console.log(`   Limited to ${allSections.length} sections`);
  }

  // Get unique technote IDs from selected sections
  const technoteIds = new Set(allSections.map((s) => s.technoteId));
  const technotes: ParsedTechnote[] = [];
  for (const id of technoteIds) {
    const technote = technotesMap.get(id);
    if (technote) {
      technotes.push(technote);
    }
  }
  console.log(`   ${technotes.length} technotes have sections to ingest`);

  // 3. Initialize Supabase
  console.log("\n2. Connecting to Supabase...");
  const supabase = getSupabaseClient();
  const existingCount = await getSectionCount(supabase);
  console.log(`   Currently ${existingCount} sections in database`);

  // 4. Upsert technotes (parent records)
  console.log("\n3. Upserting technotes...");
  await upsertTechnotes(supabase, technotes, {
    batchSize: options.upsertBatchSize,
    onProgress: ({ current, total }) => {
      process.stdout.write(`\r   ${progressBar(current, total)}`);
    },
  });
  console.log("\n   Done!");

  // 5. Generate embeddings
  console.log("\n4. Generating embeddings...");
  console.log(`   Processing ${allSections.length} sections in batches of ${options.embeddingBatchSize}`);

  const texts = allSections.map((s) => s.content);
  const startTime = Date.now();
  let lastProgressUpdate = 0;

  const embeddings = await createEmbeddings(texts, {
    batchSize: options.embeddingBatchSize,
  });

  const embeddingTime = (Date.now() - startTime) / 1000;
  console.log(`   Generated ${embeddings.length} embeddings in ${embeddingTime.toFixed(1)}s`);
  console.log(`   Rate: ${(embeddings.length / embeddingTime).toFixed(1)} embeddings/sec`);

  // 6. Upsert sections with embeddings
  console.log("\n5. Upserting sections with embeddings...");
  await upsertSections(supabase, allSections, embeddings, {
    batchSize: options.upsertBatchSize,
    onProgress: ({ current, total }) => {
      process.stdout.write(`\r   ${progressBar(current, total)}`);
    },
  });
  console.log("\n   Done!");

  // 7. Verify counts
  console.log("\n6. Verifying...");
  const finalSectionCount = await getSectionCount(supabase);
  const finalTechnoteCount = await getTechnoteCount(supabase);

  console.log(`   Technotes in DB: ${finalTechnoteCount}`);
  console.log(`   Sections in DB: ${finalSectionCount}`);

  console.log("\n" + "=".repeat(60));
  console.log("Ingestion complete!");
}

main().catch((err) => {
  console.error("\nIngestion failed:", err);
  process.exit(1);
});
