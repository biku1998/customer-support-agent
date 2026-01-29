#!/usr/bin/env node
/**
 * Inspect TechQA dataset - prints counts and sample records
 * Run with: pnpm --filter @pkg/ingest inspect
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrainingQa, loadDevQa } from "./loadQa.js";
import { loadTechnotesFromDir, loadAllSections } from "./loadTechnotes.js";
import type { ParsedQA, ParsedSection, ParsedTechnote } from "@pkg/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../../../raw-data");

function printSeparator(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

function printQaSample(qa: ParsedQA, label: string): void {
  console.log(`\n${label}:`);
  console.log(`  ID: ${qa.id}`);
  console.log(`  Title: ${qa.title.slice(0, 80)}${qa.title.length > 80 ? "..." : ""}`);
  console.log(`  Answerable: ${qa.answerable}`);
  if (qa.answerable) {
    console.log(`  Gold Doc: ${qa.goldTechnoteId}`);
    console.log(`  Answer Span: ${qa.answerSpan?.start}-${qa.answerSpan?.end}`);
    console.log(`  Answer: ${qa.answer.slice(0, 100)}${qa.answer.length > 100 ? "..." : ""}`);
  }
  console.log(`  Candidate Docs: ${qa.candidateDocIds.length}`);
}

function printSectionSample(section: ParsedSection): void {
  console.log(`\nSample Section:`);
  console.log(`  ID: ${section.id}`);
  console.log(`  Technote: ${section.technoteId}`);
  console.log(`  Index: ${section.sectionIdx}`);
  console.log(`  Heading: ${section.heading}`);
  console.log(`  Span: ${section.span.start}-${section.span.end}`);
  console.log(`  Content (first 200 chars):`);
  console.log(`    ${section.content.slice(0, 200).replace(/\n/g, " ")}...`);
}

function printTechnoteSample(technote: ParsedTechnote): void {
  console.log(`\nSample Technote:`);
  console.log(`  ID: ${technote.id}`);
  console.log(`  Title: ${technote.title.slice(0, 80)}${technote.title.length > 80 ? "..." : ""}`);
  console.log(`  Sections: ${technote.sections.length}`);
  console.log(`  Section headings: ${technote.sections.map((s) => s.heading).join(", ")}`);
}

async function main(): Promise<void> {
  console.log("TechQA Dataset Inspector");
  console.log(`Data directory: ${DATA_DIR}`);

  // Load Q&A data
  printSeparator("Q&A DATA");

  const trainingQa = await loadTrainingQa(DATA_DIR);
  const devQa = await loadDevQa(DATA_DIR);

  const trainAnswerable = trainingQa.filter((q) => q.answerable).length;
  const devAnswerable = devQa.filter((q) => q.answerable).length;

  console.log("\nCounts:");
  console.log(`  Training Q&A: ${trainingQa.length} (${trainAnswerable} answerable, ${trainingQa.length - trainAnswerable} unanswerable)`);
  console.log(`  Dev Q&A: ${devQa.length} (${devAnswerable} answerable, ${devQa.length - devAnswerable} unanswerable)`);
  console.log(`  Total: ${trainingQa.length + devQa.length}`);

  // Print samples
  const answerableTrainSample = trainingQa.find((q) => q.answerable);
  const unanswerableTrainSample = trainingQa.find((q) => !q.answerable);

  if (answerableTrainSample) {
    printQaSample(answerableTrainSample, "Sample Answerable Q&A (Training)");
  }
  if (unanswerableTrainSample) {
    printQaSample(unanswerableTrainSample, "Sample Unanswerable Q&A (Training)");
  }

  // Load Technotes
  printSeparator("TECHNOTE DATA");

  const technotes = await loadTechnotesFromDir(DATA_DIR);
  const allSections = await loadAllSections(
    `${DATA_DIR}/training_dev_technotes.sections.json`
  );

  console.log("\nCounts:");
  console.log(`  Technotes: ${technotes.size}`);
  console.log(`  Total Sections: ${allSections.length}`);
  console.log(`  Avg Sections/Technote: ${(allSections.length / technotes.size).toFixed(1)}`);

  // Section heading distribution
  const headingCounts = new Map<string, number>();
  for (const section of allSections) {
    const count = headingCounts.get(section.heading) ?? 0;
    headingCounts.set(section.heading, count + 1);
  }

  console.log("\nSection Heading Distribution (top 10):");
  const sortedHeadings = [...headingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [heading, count] of sortedHeadings) {
    console.log(`  ${heading}: ${count}`);
  }

  // Print samples
  const sampleTechnote = technotes.values().next().value;
  if (sampleTechnote) {
    printTechnoteSample(sampleTechnote);
  }

  const sampleSection = allSections[0];
  if (sampleSection) {
    printSectionSample(sampleSection);
  }

  // Verify gold documents exist
  printSeparator("VERIFICATION");

  let missingGoldDocs = 0;
  const missingIds: string[] = [];
  for (const qa of [...trainingQa, ...devQa]) {
    if (qa.goldTechnoteId && !technotes.has(qa.goldTechnoteId)) {
      missingGoldDocs++;
      if (missingIds.length < 5) {
        missingIds.push(`${qa.id} -> ${qa.goldTechnoteId}`);
      }
    }
  }

  if (missingGoldDocs === 0) {
    console.log("\n✅ All gold documents exist in technotes");
  } else {
    console.log(`\n⚠️  ${missingGoldDocs} Q&A entries reference missing technotes`);
    console.log("   First few missing:");
    for (const id of missingIds) {
      console.log(`     ${id}`);
    }
  }

  console.log("\n✅ Inspection complete");
}

main().catch((err) => {
  console.error("❌ Inspection failed:", err);
  process.exit(1);
});
