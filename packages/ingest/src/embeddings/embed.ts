/**
 * Embedding utilities using OpenAI SDK directly
 */
import OpenAI from "openai";

// Default to OpenAI's text-embedding-3-small (1536 dimensions)
const DEFAULT_MODEL = "text-embedding-3-small";

// Max characters to avoid token limit (8192 tokens * ~4 chars/token = ~32k, use 28k to be safe)
const MAX_TEXT_LENGTH = 28000;

export interface EmbeddingConfig {
  model?: string;
  batchSize?: number;
}

const defaultConfig: Required<EmbeddingConfig> = {
  model: DEFAULT_MODEL,
  batchSize: 100, // OpenAI allows up to 2048, but 100 is safer for rate limits
};

/**
 * Truncate text to fit within token limits
 */
function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }
  return text.slice(0, MAX_TEXT_LENGTH) + "...";
}

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

/**
 * Create embeddings for an array of texts
 * @param texts Array of strings to embed
 * @param config Optional configuration
 * @returns Array of embedding vectors (number[][])
 */
export async function createEmbeddings(
  texts: string[],
  config: EmbeddingConfig = {}
): Promise<number[][]> {
  const { model, batchSize } = { ...defaultConfig, ...config };

  if (texts.length === 0) {
    return [];
  }

  const openai = getOpenAI();
  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(truncateText);

    const response = await openai.embeddings.create({
      model,
      input: batch,
    });

    // Sort by index to maintain order (OpenAI may return out of order)
    const sortedEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    allEmbeddings.push(...sortedEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Create a single embedding for a query string
 * @param text The text to embed
 * @param config Optional configuration
 * @returns Embedding vector (number[])
 */
export async function createEmbedding(
  text: string,
  config: EmbeddingConfig = {}
): Promise<number[]> {
  const [embedding] = await createEmbeddings([text], config);
  if (!embedding) {
    throw new Error("Failed to create embedding");
  }
  return embedding;
}

/**
 * Get the dimension of embeddings for a given model
 */
export function getEmbeddingDimension(model: string = DEFAULT_MODEL): number {
  const dimensions: Record<string, number> = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
  };
  return dimensions[model] ?? 1536;
}
