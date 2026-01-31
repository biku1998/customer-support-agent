/**
 * Query embedding utilities
 */
import OpenAI from "openai";

const DEFAULT_MODEL = "text-embedding-3-small";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

/**
 * Create an embedding for a search query
 */
export async function embedQuery(
  query: string,
  model: string = DEFAULT_MODEL
): Promise<number[]> {
  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model,
    input: query,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Failed to create query embedding");
  }

  return embedding;
}
