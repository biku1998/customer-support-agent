#!/usr/bin/env node
/**
 * Regression test CLI
 *
 * Runs evaluation on a fixed golden set and compares against quality thresholds.
 *
 * Usage:
 *   pnpm --filter @pkg/eval regression
 *   pnpm --filter @pkg/eval regression -- --top-k 10
 *   pnpm --filter @pkg/eval regression -- --min-recall 0.6
 *   pnpm --filter @pkg/eval regression -- --output ./reports
 */
import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseClient } from "@pkg/db";
import { loadDevQa } from "@pkg/ingest";
import {
  GOLDEN_SET_IDS,
  filterToGoldenSet,
  validateGoldenSet,
} from "../src/data/goldenSet.js";
import {
  runRegression,
  formatRegressionSummary,
  formatRegressionAsCSV,
  DEFAULT_THRESHOLDS,
  type QualityThresholds,
} from "../src/runners/regression.js";

const DATA_DIR = join(import.meta.dirname, "../../../raw-data");

function parseOptions() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  const { values } = parseArgs({
    args,
    options: {
      "top-k": { type: "string", short: "k", default: "5" },
      "min-recall": { type: "string" },
      "min-citation-validity": { type: "string" },
      "max-abstention": { type: "string" },
      output: { type: "string", short: "o", default: "./eval-reports" },
      quiet: { type: "boolean", short: "q", default: false },
      "ci-mode": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
Regression Test Suite

Usage:
  pnpm --filter @pkg/eval regression [options]

Options:
  -k, --top-k <n>              Top-K for retrieval (default: 5)
  --min-recall <0-1>           Minimum Recall@K threshold (default: 0.5)
  --min-citation-validity <0-1> Minimum citation validity rate (default: 0.9)
  --max-abstention <0-1>       Maximum abstention rate (default: 0.98)
  -o, --output <dir>           Output directory (default: ./eval-reports)
  -q, --quiet                  Suppress progress output
  --ci-mode                    Exit with code 1 on failure
  -h, --help                   Show this help message

Examples:
  pnpm --filter @pkg/eval regression
  pnpm --filter @pkg/eval regression -- --top-k 10
  pnpm --filter @pkg/eval regression -- --min-recall 0.6 --ci-mode
`);
    process.exit(0);
  }

  const thresholds: Partial<QualityThresholds> = {};
  if (values["min-recall"]) {
    thresholds.minRecallAtK = parseFloat(values["min-recall"]);
  }
  if (values["min-citation-validity"]) {
    thresholds.minCitationValidityRate = parseFloat(values["min-citation-validity"]);
  }
  if (values["max-abstention"]) {
    thresholds.maxAbstentionRate = parseFloat(values["max-abstention"]);
  }

  return {
    topK: parseInt(values["top-k"] ?? "5", 10),
    thresholds,
    outputDir: values.output ?? "./eval-reports",
    quiet: values.quiet ?? false,
    ciMode: values["ci-mode"] ?? false,
  };
}

async function main(): Promise<void> {
  const { topK, thresholds, outputDir, quiet, ciMode } = parseOptions();

  if (!quiet) {
    console.log("Regression Test Suite");
    console.log("=".repeat(60));
    console.log(`Golden Set Size: ${GOLDEN_SET_IDS.length}`);
    console.log(`Top-K: ${topK}`);
    console.log(`Output: ${outputDir}`);
    console.log("");
    console.log("Thresholds:");
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    console.log(`  Min Recall@K:           ${(t.minRecallAtK * 100).toFixed(0)}%`);
    console.log(`  Min Citation Validity:  ${(t.minCitationValidityRate * 100).toFixed(0)}%`);
    console.log(`  Max Abstention Rate:    ${(t.maxAbstentionRate * 100).toFixed(0)}%`);
    console.log("");
  }

  // Load dev questions
  if (!quiet) {
    console.log("Loading dev questions...");
  }
  const allDevQuestions = await loadDevQa(DATA_DIR);
  if (!quiet) {
    console.log(`Loaded ${allDevQuestions.length} total questions`);
  }

  // Validate and filter to golden set
  const validation = validateGoldenSet(allDevQuestions);
  if (!validation.valid) {
    console.error("ERROR: Golden set validation failed!");
    console.error(`Missing question IDs: ${validation.missing.join(", ")}`);
    process.exit(1);
  }

  const goldenQuestions = filterToGoldenSet(allDevQuestions);
  if (!quiet) {
    console.log(`Filtered to ${goldenQuestions.length} golden set questions\n`);
  }

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Run regression
  const startTime = Date.now();
  const report = await runRegression(supabase, goldenQuestions, {
    topK,
    thresholds,
    onProgress: (current, total, phase) => {
      if (!quiet) {
        process.stdout.write(`\r${phase}... ${current}/${total}`);
      }
    },
  });
  const duration = Date.now() - startTime;

  if (!quiet) {
    console.log("\n\n");
  }

  // Print summary
  console.log(formatRegressionSummary(report));
  console.log(`\nDuration: ${(duration / 1000).toFixed(1)}s`);

  // Write reports
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = join(outputDir, `regression-${timestamp}.json`);
  const csvPath = join(outputDir, `regression-${timestamp}.csv`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(csvPath, formatRegressionAsCSV(report));

  console.log(`\nReports written to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);

  // Print failure details if not passed
  if (!report.passed && !quiet) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("FAILED THRESHOLDS:");
    for (const t of report.thresholdResults) {
      if (!t.passed) {
        const op = t.comparison === "min" ? "below" : "above";
        console.log(`  - ${t.name}: ${(t.actual * 100).toFixed(1)}% is ${op} threshold ${(t.threshold * 100).toFixed(1)}%`);
      }
    }

    // Show sample failures for retrieval misses
    const misses = report.details.filter(
      (d) => d.goldTechnoteId && !d.retrievalHit
    );
    if (misses.length > 0) {
      console.log(`\n${"─".repeat(60)}`);
      console.log("Sample Retrieval Misses:");
      for (const miss of misses.slice(0, 3)) {
        console.log(`  Query: ${miss.queryId}`);
        console.log(`  Question: ${miss.question.slice(0, 80)}...`);
        console.log(`  Gold: ${miss.goldTechnoteId}`);
        console.log(`  Retrieved: ${miss.retrievedTechnoteIds.slice(0, 3).join(", ")}`);
        console.log("");
      }
    }

    // Show invalid citations
    const withInvalid = report.details.filter(
      (d) => d.invalidCitations.length > 0
    );
    if (withInvalid.length > 0) {
      console.log(`${"─".repeat(60)}`);
      console.log("Sample Invalid Citations:");
      for (const d of withInvalid.slice(0, 3)) {
        console.log(`  Query: ${d.queryId}`);
        console.log(`  Invalid: ${d.invalidCitations.join(", ")}`);
        console.log("");
      }
    }
  }

  // Exit with appropriate code for CI
  if (ciMode || !report.passed) {
    process.exit(report.passed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("\nRegression test failed:", err);
  process.exit(1);
});
