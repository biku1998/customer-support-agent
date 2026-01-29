/**
 * Loader for TechQA technote sections file
 */
import { readFile } from "node:fs/promises";
import type {
  RawTechnotesMap,
  RawTechnote,
  ParsedTechnote,
  ParsedSection,
} from "@pkg/shared";
import { createSectionId } from "@pkg/shared";

/**
 * Parse a raw technote into normalized form with stable section IDs
 */
function parseTechnote(raw: RawTechnote): ParsedTechnote {
  const sections: ParsedSection[] = raw.sections.map((section, idx) => ({
    id: createSectionId(raw.id, idx),
    technoteId: raw.id,
    sectionIdx: idx,
    heading: section.id,
    content: section.text,
    span: {
      start: section.start,
      end: section.end,
    },
  }));

  return {
    id: raw.id,
    title: raw.title,
    fullText: raw.text,
    sections,
  };
}

/**
 * Load and parse the technotes sections JSON file
 * Returns a Map for O(1) lookup by technote ID
 */
export async function loadTechnotes(
  filePath: string
): Promise<Map<string, ParsedTechnote>> {
  const content = await readFile(filePath, "utf-8");
  const raw: RawTechnotesMap = JSON.parse(content);

  const technotes = new Map<string, ParsedTechnote>();
  for (const [id, rawTechnote] of Object.entries(raw)) {
    technotes.set(id, parseTechnote(rawTechnote));
  }
  return technotes;
}

/**
 * Load technotes and flatten all sections into a single array
 * This is the primary indexing unit for RAG
 */
export async function loadAllSections(
  filePath: string
): Promise<ParsedSection[]> {
  const technotes = await loadTechnotes(filePath);
  const sections: ParsedSection[] = [];
  for (const technote of technotes.values()) {
    sections.push(...technote.sections);
  }
  return sections;
}

/**
 * Load technotes from the default location
 */
export async function loadTechnotesFromDir(
  dataDir: string
): Promise<Map<string, ParsedTechnote>> {
  return loadTechnotes(`${dataDir}/training_dev_technotes.sections.json`);
}
