import { describe, it, expect } from 'vitest';
import { embed, embedMany } from 'ai';
import { createWatsonx } from '../src';

const watsonx = createWatsonx();
const embeddingModel = watsonx.textEmbeddingModel(
  'ibm/granite-embedding-278m-multilingual'
);

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe('Embeddings', () => {
  it('should generate a single embedding', async () => {
    const result = await embed({
      model: embeddingModel,
      value: 'The quick brown fox jumps over the lazy dog.',
    });

    expect(result.embedding).toBeDefined();
    expect(Array.isArray(result.embedding)).toBe(true);
    expect(result.embedding.length).toBeGreaterThan(0);
    // All values should be numbers
    expect(result.embedding.every((v) => typeof v === 'number')).toBe(true);
  });

  it('should generate multiple embeddings', async () => {
    const result = await embedMany({
      model: embeddingModel,
      values: [
        'Hello world',
        'Goodbye world',
        'The weather is nice today',
      ],
    });

    expect(result.embeddings).toBeDefined();
    expect(result.embeddings.length).toBe(3);
    // All embeddings should have the same dimension
    const dimension = result.embeddings[0].length;
    expect(result.embeddings.every((e) => e.length === dimension)).toBe(true);
  });

  it('should produce similar embeddings for similar texts', async () => {
    const result = await embedMany({
      model: embeddingModel,
      values: [
        'The cat sat on the mat.',
        'A cat was sitting on a mat.',
        'The stock market crashed today.',
      ],
    });

    const [catEmbedding1, catEmbedding2, stockEmbedding] = result.embeddings;

    // Similar sentences should have higher cosine similarity
    const similarityCats = cosineSimilarity(catEmbedding1, catEmbedding2);
    const similarityCatStock = cosineSimilarity(catEmbedding1, stockEmbedding);

    expect(similarityCats).toBeGreaterThan(similarityCatStock);
    expect(similarityCats).toBeGreaterThan(0.8); // Similar sentences should be highly similar
  });

  it('should report usage', async () => {
    const result = await embed({
      model: embeddingModel,
      value: 'Test input for usage tracking.',
    });

    expect(result.usage).toBeDefined();
    expect(result.usage?.tokens).toBeGreaterThan(0);
  });
});
