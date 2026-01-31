#!/usr/bin/env node
/**
 * Grounded answer evaluation CLI
 *
 * Usage:
 *   pnpm --filter @pkg/eval grounded
 *   pnpm --filter @pkg/eval grounded -- --sample 25
 *   pnpm --filter @pkg/eval grounded -- --top-k 8
 *   pnpm --filter @pkg/eval grounded -- --seed 42
 */
import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseClient } from "@pkg/db";
import { loadDevQa } from "@pkg/ingest";
import {
  runGroundedEval,
  formatGroundedSummary,
  formatGroundedAsCSV,
} from "../src/runners/groundedEval.js";

const DATA_DIR = join(import.meta.dirname, "../../../raw-data");

function parseOptions() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  const { values } = parseArgs({
    args,
    options: {
      "top-k": { type: "string", short: "k", default: "5" },
      sample: { type: "string", short: "s", default: "25" },
      seed: { type: "string" },
      output: { type: "string", short: "o", default: "./eval-reports" },
      quiet: { type: "boolean", short: "q", default: false },
    },
  });

  return {
    topK: parseInt(values["top-k"] ?? "5", 10),
    sampleSize: parseInt(values.sample ?? "25", 10),
    seed: values.seed ? parseInt(values.seed, 10) : undefined,
    outputDir: values.output ?? "./eval-reports",
    quiet: values.quiet ?? false,
  };
}

async function main(): Promise<void> {
  const { topK, sampleSize, seed, outputDir, quiet } = parseOptions();

  if (!quiet) {
    console.log("Grounded Answer Evaluation");
    console.log("=".repeat(60));
    console.log(`Top-K: ${topK}`);
    console.log(`Sample size: ${sampleSize}`);
    if (seed !== undefined) {
      console.log(`Seed: ${seed}`);
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
  const report = await runGroundedEval(supabase, devQuestions, {
    topK,
    sampleSize,
    seed,
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
  console.log(formatGroundedSummary(report));
  console.log(`\nDuration: ${(duration / 1000).toFixed(1)}s`);

  // Write reports
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = join(outputDir, `grounded-eval-${timestamp}.json`);
  const csvPath = join(outputDir, `grounded-eval-${timestamp}.csv`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(csvPath, formatGroundedAsCSV(report));

  console.log(`\nReports written to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);

  // Print some examples
  if (!quiet) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Sample Answers:");
    console.log("-".repeat(60));

    const samples = report.details.slice(0, 3);
    for (const sample of samples) {
      console.log(`\nQuery: ${sample.queryId}`);
      console.log(`Question: ${sample.question.slice(0, 100)}...`);
      console.log(`Answer: ${sample.answer.slice(0, 200)}...`);
      console.log(`Citations: ${sample.citationCount} (valid: ${sample.validCitations.length})`);
      if (sample.isAbstention) {
        console.log("(Abstained)");
      }
    }
  }
}

main().catch((err) => {
  console.error("\nEvaluation failed:", err);
  process.exit(1);
});
