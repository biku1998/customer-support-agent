/**
 * Batched upsert for technote sections with embeddings
 */
import type { TypedSupabaseClient, TechnoteInsert, TechnoteSectionInsert } from "@pkg/db";
import type { ParsedTechnote, ParsedSection } from "@pkg/shared";

export interface UpsertConfig {
  batchSize?: number;
  onProgress?: (progress: { current: number; total: number; type: string }) => void;
}

const defaultConfig: Required<Omit<UpsertConfig, "onProgress">> = {
  batchSize: 100,
};

/**
 * Upsert technotes (parent records) in batches
 */
export async function upsertTechnotes(
  supabase: TypedSupabaseClient,
  technotes: ParsedTechnote[],
  config: UpsertConfig = {}
): Promise<void> {
  const { batchSize, onProgress } = { ...defaultConfig, ...config };

  for (let i = 0; i < technotes.length; i += batchSize) {
    const batch = technotes.slice(i, i + batchSize);

    const rows: TechnoteInsert[] = batch.map((t) => ({
      id: t.id,
      title: t.title,
      full_text: t.fullText,
      section_count: t.sections.length,
    }));

    const { error } = await supabase.from("technotes").upsert(rows, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to upsert technotes batch: ${error.message}`);
    }

    onProgress?.({
      current: Math.min(i + batchSize, technotes.length),
      total: technotes.length,
      type: "technotes",
    });
  }
}

/**
 * Convert embedding array to pgvector format string
 */
function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Upsert sections with embeddings in batches
 */
export async function upsertSections(
  supabase: TypedSupabaseClient,
  sections: ParsedSection[],
  embeddings: number[][],
  config: UpsertConfig = {}
): Promise<void> {
  const { batchSize, onProgress } = { ...defaultConfig, ...config };

  if (sections.length !== embeddings.length) {
    throw new Error(
      `Sections and embeddings count mismatch: ${sections.length} vs ${embeddings.length}`
    );
  }

  for (let i = 0; i < sections.length; i += batchSize) {
    const sectionBatch = sections.slice(i, i + batchSize);
    const embeddingBatch = embeddings.slice(i, i + batchSize);

    const rows: TechnoteSectionInsert[] = sectionBatch.map((s, idx) => ({
      id: s.id,
      technote_id: s.technoteId,
      section_idx: s.sectionIdx,
      heading: s.heading,
      content: s.content,
      span_start: s.span.start,
      span_end: s.span.end,
      embedding: formatEmbedding(embeddingBatch[idx]!),
    }));

    const { error } = await supabase.from("technote_sections").upsert(rows, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to upsert sections batch: ${error.message}`);
    }

    onProgress?.({
      current: Math.min(i + batchSize, sections.length),
      total: sections.length,
      type: "sections",
    });
  }
}

/**
 * Get count of sections currently in the database
 */
export async function getSectionCount(
  supabase: TypedSupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from("technote_sections")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to get section count: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Get count of technotes currently in the database
 */
export async function getTechnoteCount(
  supabase: TypedSupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from("technotes")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to get technote count: ${error.message}`);
  }

  return count ?? 0;
}
