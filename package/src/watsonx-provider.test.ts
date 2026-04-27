import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWatsonx } from './watsonx-provider';
import { WatsonxChatLanguageModel } from './watsonx-chat-language-model';
import { WatsonxEmbeddingModel } from './watsonx-embedding-model';
import { clearTokenCache } from './watsonx-iam';
import {
  createMockFetch,
  createMockChatResponse,
  createMockEmbeddingResponse,
  createMockIAMResponse,
} from './test-utils';

// Store original fetch
const originalFetch = global.fetch;

describe('createWatsonx', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearTokenCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('provider factory', () => {
    it('should create a provider instance', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
    });

    it('should create a chat model when called as a function', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      expect(model).toBeInstanceOf(WatsonxChatLanguageModel);
      expect(model.modelId).toBe('ibm/granite-4-h-small');
      expect(model.provider).toBe('watsonx.chat');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should support chat() method', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider.chat('ibm/granite-4-h-small');

      expect(model).toBeInstanceOf(WatsonxChatLanguageModel);
      expect(model.modelId).toBe('ibm/granite-4-h-small');
    });

    it('should support languageModel() method', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider.languageModel('ibm/granite-4-h-small');

      expect(model).toBeInstanceOf(WatsonxChatLanguageModel);
      expect(model.modelId).toBe('ibm/granite-4-h-small');
    });
  });

  describe('configuration', () => {
    it('should use custom API key', () => {
      const provider = createWatsonx({
        apiKey: 'custom-key',
        projectId: 'custom-project',
      });

      const model = provider('ibm/granite-4-h-small');
      expect(model).toBeDefined();
    });

    it('should use custom base URL', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx({
        baseURL: 'https://eu-de.ml.cloud.ibm.com',
      });

      const model = provider('ibm/granite-4-h-small');
      expect(model).toBeDefined();
    });

    it('should throw error when API key is missing', () => {
      delete process.env.WATSONX_AI_APIKEY;
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      // The error is thrown when accessing the API key, not when creating the model
      expect(() => {
        // Access internal config to trigger the error
        (model as any).config.apiKey();
      }).toThrow('IBM Cloud API key is required');
    });

    it('should throw error when project ID is missing', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      delete process.env.WATSONX_AI_PROJECT_ID;

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      expect(() => {
        (model as any).config.projectId();
      }).toThrow('watsonx.ai project ID is required');
    });

    it('should use default base URL (us-south)', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      // Check that the chat API was called with the default URL
      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      expect(chatCall![0]).toContain('us-south.ml.cloud.ibm.com');
    });

    it('should use custom base URL in API calls', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const provider = createWatsonx({
        baseURL: 'https://eu-de.ml.cloud.ibm.com',
      });
      const model = provider('ibm/granite-4-h-small');

      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      expect(chatCall![0]).toContain('eu-de.ml.cloud.ibm.com');
    });

    it('should include custom headers in API calls', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const provider = createWatsonx({
        headers: { 'X-Custom-Header': 'custom-value' },
      });
      const model = provider('ibm/granite-4-h-small');

      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      // Headers may be normalized to lowercase
      expect(chatCall![1].headers['x-custom-header'] || chatCall![1].headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('call options', () => {
    it('should forward standard generation parameters from call options to the API', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        temperature: 0.5,
        topP: 0.8,
        maxOutputTokens: 1024,
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.temperature).toBe(0.5);
      expect(requestBody.top_p).toBe(0.8);
      expect(requestBody.max_tokens).toBe(1024);
    });

    it('should forward providerOptions.watsonx.timeLimit to the API', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const provider = createWatsonx();
      const model = provider('ibm/granite-4-h-small');

      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        providerOptions: { watsonx: { timeLimit: 30000 } },
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.time_limit).toBe(30000);
    });
  });

  describe('embedding models', () => {
    it('should support textEmbeddingModel() method', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider.textEmbeddingModel('ibm/granite-embedding-107m-multilingual');

      expect(model).toBeInstanceOf(WatsonxEmbeddingModel);
      expect(model.modelId).toBe('ibm/granite-embedding-107m-multilingual');
      expect(model.provider).toBe('watsonx.embedding');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should pass embedding settings to the model instance', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider.textEmbeddingModel('ibm/slate-125m-english-rtrvr-v2', {
        truncateInputTokens: true,
      }) as WatsonxEmbeddingModel;

      expect(model.settings.truncateInputTokens).toBe(true);
    });

    it('should expose embeddingModel() alongside textEmbeddingModel()', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();
      const model = provider.embeddingModel('ibm/granite-embedding-107m-multilingual');
      expect(model).toBeInstanceOf(WatsonxEmbeddingModel);
      expect(model.provider).toBe('watsonx.embedding');
    });

    it('should make embedding API calls correctly', async () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockEmbeddingResponse({
            embeddings: [[0.1, 0.2, 0.3]],
            inputTokenCount: 5,
          }),
        })();
      });

      const provider = createWatsonx();
      const model = provider.textEmbeddingModel('ibm/granite-embedding-107m-multilingual');

      const result = await model.doEmbed({ values: ['Test text'] });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.usage?.tokens).toBe(5);
    });
  });

  describe('model ID handling', () => {
    it('should accept any string as model ID (typed models)', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();

      // Known models
      const granite = provider('ibm/granite-4-h-small');
      expect(granite.modelId).toBe('ibm/granite-4-h-small');

      const llama = provider('meta-llama/llama-3-3-70b-instruct');
      expect(llama.modelId).toBe('meta-llama/llama-3-3-70b-instruct');

      // Custom/unknown model
      const custom = provider('custom/my-model-v1');
      expect(custom.modelId).toBe('custom/my-model-v1');
    });

    it('should accept any string as embedding model ID', () => {
      process.env.WATSONX_AI_APIKEY = 'test-key';
      process.env.WATSONX_AI_PROJECT_ID = 'test-project';

      const provider = createWatsonx();

      // Known model
      const granite = provider.textEmbeddingModel('ibm/granite-embedding-107m-multilingual');
      expect(granite.modelId).toBe('ibm/granite-embedding-107m-multilingual');

      // Custom model
      const custom = provider.textEmbeddingModel('custom/embedding-model');
      expect(custom.modelId).toBe('custom/embedding-model');
    });
  });
});
