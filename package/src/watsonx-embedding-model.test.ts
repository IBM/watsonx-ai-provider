import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatsonxEmbeddingModel } from './watsonx-embedding-model';
import {
  createMockFetch,
  createMockEmbeddingResponse,
  createMockIAMResponse,
  TEST_EMBEDDING_CONFIG,
} from './test-utils';
import { clearTokenCache } from './watsonx-iam';

// Store original fetch
const originalFetch = global.fetch;

// Helper to create a test model instance
function createTestModel(
  modelId = 'ibm/granite-embedding-107m-multilingual',
  settings = {}
) {
  return new WatsonxEmbeddingModel(modelId, settings, TEST_EMBEDDING_CONFIG);
}

describe('WatsonxEmbeddingModel', () => {
  beforeEach(() => {
    clearTokenCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('model properties', () => {
    it('should have correct specification version', () => {
      const model = createTestModel();
      expect(model.specificationVersion).toBe('v3');
    });

    it('should have correct provider name', () => {
      const model = createTestModel();
      expect(model.provider).toBe('watsonx.embedding');
    });

    it('should have correct model ID', () => {
      const model = createTestModel('ibm/slate-125m-english-rtrvr-v2');
      expect(model.modelId).toBe('ibm/slate-125m-english-rtrvr-v2');
    });

    it('should support parallel calls', () => {
      const model = createTestModel();
      expect(model.supportsParallelCalls).toBe(true);
    });

    it('should have max embeddings per call set', () => {
      const model = createTestModel();
      expect(model.maxEmbeddingsPerCall).toBe(100);
    });

    it('should store settings', () => {
      const model = createTestModel('ibm/granite-embedding-107m-multilingual', {
        truncateInputTokens: true,
      });
      expect(model.settings.truncateInputTokens).toBe(true);
    });
  });

  describe('doEmbed', () => {
    it('should make API call and return embeddings', async () => {
      const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({
            embeddings: mockEmbeddings,
            inputTokenCount: 20,
          }),
        })();
      });

      const model = createTestModel();
      const result = await model.doEmbed({
        values: ['Hello', 'World'],
      });

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
      expect(result.usage?.tokens).toBe(20);
    });

    it('should include model_id and project_id in request body', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({
            embeddings: [[0.1, 0.2]],
          }),
        })();
      });

      const model = createTestModel('ibm/slate-125m-english-rtrvr-v2');
      await model.doEmbed({ values: ['Test'] });

      const embeddingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/embeddings')
      );
      expect(embeddingCall).toBeDefined();

      const requestBody = JSON.parse(embeddingCall![1].body);
      expect(requestBody.model_id).toBe('ibm/slate-125m-english-rtrvr-v2');
      expect(requestBody.project_id).toBe('test-project-id');
      expect(requestBody.inputs).toEqual(['Test']);
    });

    it('should include truncation parameter when enabled', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({ embeddings: [[0.1]] }),
        })();
      });

      const model = createTestModel('ibm/granite-embedding-107m-multilingual', {
        truncateInputTokens: true,
      });
      await model.doEmbed({ values: ['Test'] });

      const embeddingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/embeddings')
      );
      const requestBody = JSON.parse(embeddingCall![1].body);
      expect(requestBody.parameters).toEqual({ truncate_input_tokens: true });
    });

    it('should not include truncation parameter when disabled', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({ embeddings: [[0.1]] }),
        })();
      });

      const model = createTestModel('ibm/granite-embedding-107m-multilingual', {
        truncateInputTokens: false,
      });
      await model.doEmbed({ values: ['Test'] });

      const embeddingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/embeddings')
      );
      const requestBody = JSON.parse(embeddingCall![1].body);
      expect(requestBody.parameters).toBeUndefined();
    });

    it('should calculate total tokens from top-level count', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: {
            model_id: 'ibm/granite-embedding-107m-multilingual',
            results: [
              { embedding: [0.1], input_token_count: 5 },
              { embedding: [0.2], input_token_count: 5 },
            ],
            input_token_count: 10,
          },
        })();
      });

      const model = createTestModel();
      const result = await model.doEmbed({ values: ['Hello', 'World'] });

      expect(result.usage?.tokens).toBe(10);
    });

    it('should sum tokens from results when top-level count is missing', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: {
            model_id: 'ibm/granite-embedding-107m-multilingual',
            results: [
              { embedding: [0.1], input_token_count: 5 },
              { embedding: [0.2], input_token_count: 7 },
            ],
            // No top-level input_token_count
          },
        })();
      });

      const model = createTestModel();
      const result = await model.doEmbed({ values: ['Hello', 'World'] });

      expect(result.usage?.tokens).toBe(12);
    });

    it('should handle zero tokens correctly', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: {
            model_id: 'ibm/granite-embedding-107m-multilingual',
            results: [{ embedding: [0.1] }],
            input_token_count: 0,
          },
        })();
      });

      const model = createTestModel();
      const result = await model.doEmbed({ values: [''] });

      // Should use the explicit 0 from top-level, not sum from results
      expect(result.usage?.tokens).toBe(0);
    });
  });

  describe('doEmbed error handling', () => {
    it('should throw on 400 Bad Request', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: { errors: [{ code: 'invalid_request', message: 'Invalid input' }] },
          status: 400,
        })();
      });

      const model = createTestModel();
      await expect(model.doEmbed({ values: ['Test'] })).rejects.toThrow();
    });

    it('should throw on 401 Unauthorized', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: { error: 'Unauthorized' },
          status: 401,
        })();
      });

      const model = createTestModel();
      await expect(model.doEmbed({ values: ['Test'] })).rejects.toThrow();
    });

    it('should throw on 429 Rate Limit', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: { error: 'Rate limit exceeded' },
          status: 429,
        })();
      });

      const model = createTestModel();
      await expect(model.doEmbed({ values: ['Test'] })).rejects.toThrow();
    });

    it('should throw on 500 Server Error', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: { error: 'Internal server error' },
          status: 500,
        })();
      });

      const model = createTestModel();
      await expect(model.doEmbed({ values: ['Test'] })).rejects.toThrow();
    });
  });

  describe('batch embedding', () => {
    it('should handle multiple texts in a single request', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({
            embeddings: mockEmbeddings,
            inputTokenCount: 30,
          }),
        })();
      });

      const model = createTestModel();
      const result = await model.doEmbed({
        values: ['First', 'Second', 'Third'],
      });

      expect(result.embeddings).toHaveLength(3);

      // Verify all texts were sent in one request
      const embeddingCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/embeddings')
      );
      const requestBody = JSON.parse(embeddingCall![1].body);
      expect(requestBody.inputs).toEqual(['First', 'Second', 'Third']);
    });
  });
});
