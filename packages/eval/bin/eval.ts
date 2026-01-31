#!/usr/bin/env node
/**
 * Retrieval evaluation CLI
 *
 * Usage:
 *   pnpm --filter @pkg/eval retrieval
 *   pnpm --filter @pkg/eval retrieval -- --top-k 10
 *   pnpm --filter @pkg/eval retrieval -- --limit 50
 *   pnpm --filter @pkg/eval retrieval -- --output ./reports
 */
import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseClient } from "@pkg/db";
import { loadDevQa } from "@pkg/ingest";
import {
  runDevSetEval,
  formatReportAsCSV,
  formatAggregateSummary,
} from "../src/runners/devSet.js";

const DATA_DIR = join(import.meta.dirname, "../../../raw-data");

function parseOptions() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  const { values } = parseArgs({
    args,
    options: {
      "top-k": { type: "string", short: "k", default: "5" },
      limit: { type: "string", short: "l" },
      output: { type: "string", short: "o", default: "./eval-reports" },
      quiet: { type: "boolean", short: "q", default: false },
    },
  });

  return {
    topK: parseInt(values["top-k"] ?? "5", 10),
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    outputDir: values.output ?? "./eval-reports",
    quiet: values.quiet ?? false,
  };
}

async function main(): Promise<void> {
  const { topK, limit, outputDir, quiet } = parseOptions();

  if (!quiet) {
    console.log("Retrieval Evaluation");
    console.log("=".repeat(60));
    console.log(`Top-K: ${topK}`);
    if (limit) {
      console.log(`Limit: ${limit} questions`);
    }
    console.log(`Output: ${outputDir}`);
    console.log("");
  }

  // Load dev questions
  if (!quiet) {
    console.log("Loading dev questions...");
  }
  const devQuestions = await loadDevQa(DATA_DIR);
  if (!quiet) {
    console.log(`Loaded ${devQuestions.length} questions\n`);
  }

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Run evaluation with progress
  const startTime = Date.now();
  const report = await runDevSetEval(supabase, devQuestions, {
    topK,
    limit,
    onProgress: (current, total) => {
      if (!quiet) {
        process.stdout.write(`\rEvaluating... ${current}/${total}`);
      }
    },
  });
  const duration = Date.now() - startTime;

  if (!quiet) {
    console.log("\n");
  }

  // Print summary
  console.log(formatAggregateSummary(report.aggregate));
  console.log(`\nDuration: ${(duration / 1000).toFixed(1)}s`);

  // Write reports
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = join(outputDir, `retrieval-eval-${timestamp}.json`);
  const csvPath = join(outputDir, `retrieval-eval-${timestamp}.csv`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(csvPath, formatReportAsCSV(report));

  console.log(`\nReports written to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);

  // Print some example misses for inspection
  const misses = report.details.filter(
    (d) => d.goldTechnoteId && !d.metrics.hit
  );
  if (misses.length > 0 && !quiet) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Sample Misses (gold not in top-k):");
    console.log("-".repeat(60));

    const sampleMisses = misses.slice(0, 3);
    for (const miss of sampleMisses) {
      console.log(`\nQuery: ${miss.queryId}`);
      console.log(`Question: ${miss.question.slice(0, 100)}...`);
      console.log(`Gold: ${miss.goldTechnoteId}`);
      console.log(`Retrieved: ${miss.retrievedTechnoteIds.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error("\nEvaluation failed:", err);
  process.exit(1);
});
