/**
 * Embedding Service for NinjaTrader Skills
 *
 * Uses @xenova/transformers with nomic-ai/nomic-embed-text-v1.5 model
 * for generating 768-dimensional embeddings locally.
 */

import { pipeline, env } from "@xenova/transformers";

// Configure transformers.js to use local cache
env.cacheDir = "./.cache/transformers";
env.allowLocalModels = true;
env.allowRemoteModels = true;

// Model configuration
const MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5";
const EMBEDDING_DIM = 768;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbeddingPipeline = any;

// Lazy-loaded embedder instance
let embedder: EmbeddingPipeline | null = null;
let initPromise: Promise<EmbeddingPipeline> | null = null;

/**
 * Get or initialize the embedding pipeline.
 * First call downloads the model (~500MB), subsequent calls are instant.
 */
export async function getEmbedder(): Promise<EmbeddingPipeline> {
  if (embedder) {
    return embedder;
  }

  // Prevent multiple simultaneous initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.error(`Loading embedding model: ${MODEL_NAME}...`);
    const start = Date.now();

    const model = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: true, // Use quantized model for faster inference
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`Embedding model loaded in ${elapsed}s`);

    embedder = model;
    return model;
  })();

  return initPromise;
}

/**
 * Generate embedding for a single text string.
 * Returns a Float32Array of 768 dimensions.
 */
export async function embed(text: string): Promise<Float32Array> {
  const model = await getEmbedder();

  // Nomic model expects "search_document: " prefix for documents
  // and "search_query: " prefix for queries
  const prefixedText = text.startsWith("search_")
    ? text
    : `search_document: ${text}`;

  const output = await model(prefixedText, {
    pooling: "mean",
    normalize: true,
  });

  // Extract the embedding data
  const embeddingData = output.data as Float32Array;

  // Verify dimensions
  if (embeddingData.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding dimension: ${embeddingData.length}, expected ${EMBEDDING_DIM}`
    );
  }

  return new Float32Array(embeddingData);
}

/**
 * Generate embedding for a search query.
 * Uses "search_query: " prefix for better retrieval performance.
 */
export async function embedQuery(query: string): Promise<Float32Array> {
  const model = await getEmbedder();

  const prefixedQuery = `search_query: ${query}`;

  const output = await model(prefixedQuery, {
    pooling: "mean",
    normalize: true,
  });

  return new Float32Array(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling embed() multiple times.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) {
    return [];
  }

  const model = await getEmbedder();

  // Process in batches to avoid memory issues
  const BATCH_SIZE = 16;
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const prefixedBatch = batch.map((text) =>
      text.startsWith("search_") ? text : `search_document: ${text}`
    );

    // Process batch
    const batchResults = await Promise.all(
      prefixedBatch.map(async (text) => {
        const output = await model(text, {
          pooling: "mean",
          normalize: true,
        });
        return new Float32Array(output.data as Float32Array);
      })
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Create searchable text from skill fields.
 * Combines name, description, and keywords for embedding.
 */
export function createSkillText(
  name: string,
  description: string,
  keywords: string[]
): string {
  const keywordStr =
    keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : "";
  return `${name}: ${description}. ${keywordStr}`.trim();
}

/**
 * Convert Float32Array to Buffer for SQLite storage.
 */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Convert Buffer from SQLite back to Float32Array.
 */
export function bufferToEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
}

// Export constants for external use
export { EMBEDDING_DIM, MODEL_NAME };
