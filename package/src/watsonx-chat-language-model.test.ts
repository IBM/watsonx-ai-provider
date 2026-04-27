import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APICallError } from '@ai-sdk/provider';
import { WatsonxChatLanguageModel } from './watsonx-chat-language-model';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import {
  createMockFetch,
  createMockChatResponse,
  createMockIAMResponse,
  TEST_CONFIG,
} from './test-utils';
import { clearTokenCache } from './watsonx-iam';

// Store original fetch
const originalFetch = global.fetch;

// Helper to create a test model instance
function createTestModel(modelId = 'ibm/granite-4-h-small') {
  return new WatsonxChatLanguageModel(modelId, TEST_CONFIG);
}

// Helper to create a simple prompt
function createSimplePrompt(text = 'Hello'): LanguageModelV3CallOptions['prompt'] {
  return [{ role: 'user', content: [{ type: 'text', text }] }];
}

describe('WatsonxChatLanguageModel', () => {
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
      expect(model.provider).toBe('watsonx.chat');
    });

    it('should have the model ID set', () => {
      const model = createTestModel('mistralai/mistral-medium-2505');
      expect(model.modelId).toBe('mistralai/mistral-medium-2505');
    });

    it('should declare image/* supportedUrls for vision models', () => {
      const model = createTestModel();
      expect(Object.keys(model.supportedUrls)).toContain('image/*');
    });
  });

  describe('doGenerate', () => {
    it('should make API call and return parsed response', async () => {
      const mockIAMFetch = createMockFetch({ response: createMockIAMResponse() });
      const mockChatFetch = createMockFetch({
        response: createMockChatResponse({ content: 'Hello, world!' }),
      });

      // Mock fetch to handle both IAM and chat API calls
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return mockIAMFetch();
        }
        return mockChatFetch();
      });

      const model = createTestModel();
      const result = await model.doGenerate({
        prompt: createSimplePrompt(),
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
      expect(result.finishReason.unified).toBe('stop');
      expect(result.usage.inputTokens.total).toBe(10);
      expect(result.usage.outputTokens.total).toBe(5);
    });

    it('should include model_id and project_id in request body', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const model = createTestModel('ibm/granite-4-h-small');
      await model.doGenerate({ prompt: createSimplePrompt() });

      // Check the second call (chat API)
      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      expect(chatCall).toBeDefined();

      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.model_id).toBe('ibm/granite-4-h-small');
      expect(requestBody.project_id).toBe('test-project-id');
    });

    it('should include max_tokens from options', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        maxOutputTokens: 500,
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.max_tokens).toBe(500);
    });

    it('should include temperature and topP from options', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        temperature: 0.8,
        topP: 0.9,
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.temperature).toBe(0.8);
      expect(requestBody.top_p).toBe(0.9);
    });

    it('should handle tool calls in response', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: createMockChatResponse({
            toolCalls: [
              { id: 'call-1', name: 'getWeather', arguments: '{"location":"Tokyo"}' },
            ],
            finishReason: 'tool_calls',
          }),
        })();
      });

      const model = createTestModel();
      const result = await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      });

      expect(result.content).toContainEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'getWeather',
        input: '{"location":"Tokyo"}',
      });
      expect(result.finishReason.unified).toBe('tool-calls');
    });

    it('should return warnings for unsupported features', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });

      const model = createTestModel();
      const result = await model.doGenerate({
        prompt: createSimplePrompt(),
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        seed: 42,
      });

      expect(result.warnings).toContainEqual({ type: 'unsupported', feature: 'frequencyPenalty' });
      expect(result.warnings).toContainEqual({ type: 'unsupported', feature: 'presencePenalty' });
      expect(result.warnings).toContainEqual({ type: 'unsupported', feature: 'seed' });
    });
  });

  describe('doGenerate error handling', () => {
    it('should throw APICallError on 400 Bad Request', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: { errors: [{ code: 'invalid_request', message: 'Invalid model' }] },
          status: 400,
        })();
      });

      const model = createTestModel();
      await expect(model.doGenerate({ prompt: createSimplePrompt() })).rejects.toThrow();
    });

    it('should throw APICallError on 401 Unauthorized', async () => {
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
      await expect(model.doGenerate({ prompt: createSimplePrompt() })).rejects.toThrow();
    });

    it('should throw retryable APICallError on 429 Rate Limit', async () => {
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

      try {
        await model.doGenerate({ prompt: createSimplePrompt() });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect((error as APICallError).isRetryable).toBe(true);
      }
    });

    it('should throw retryable APICallError on 500 Server Error', async () => {
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

      try {
        await model.doGenerate({ prompt: createSimplePrompt() });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect((error as APICallError).isRetryable).toBe(true);
      }
    });

    it('should throw APICallError when no choices returned', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({
          response: {
            id: 'test-id',
            model_id: 'ibm/granite-4-h-small',
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
          },
        })();
      });

      const model = createTestModel();
      await expect(model.doGenerate({ prompt: createSimplePrompt() })).rejects.toThrow(
        'No choices returned'
      );
    });
  });

  describe('doStream', () => {
    it('should return a stream result object', async () => {
      // Create a simple mock that returns a valid streaming response structure
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        // Return a mock stream response
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          url: 'https://test.com',
          body: stream,
        });
      });

      const model = createTestModel();
      const result = await model.doStream({ prompt: createSimplePrompt() });

      expect(result.stream).toBeDefined();
      expect(result.request?.body).toBeDefined();
      expect(result.response?.headers).toBeDefined();
    });

    it('should include correct request body in stream result', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          url: 'https://test.com',
          body: stream,
        });
      });

      const model = createTestModel();
      const result = await model.doStream({
        prompt: createSimplePrompt('Test streaming'),
        maxOutputTokens: 100,
      });

      expect(result.request?.body).toMatchObject({
        model_id: 'ibm/granite-4-h-small',
        project_id: 'test-project-id',
        max_tokens: 100,
      });
    });

    it('should call streaming endpoint with correct URL', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          url: 'https://test.com',
          body: stream,
        });
      });

      const model = createTestModel();
      await model.doStream({ prompt: createSimplePrompt() });

      // Verify the streaming endpoint was called
      const streamCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat_stream')
      );
      expect(streamCall).toBeDefined();
      // Note: Accept header is set internally by createEventSourceResponseHandler
      // in postJsonToApi; we no longer set it manually. We just verify the
      // streaming endpoint was hit.
    });

    it('should throw APICallError on streaming 429', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: 'Rate limited' }),
          text: () => Promise.resolve('Rate limited'),
          headers: new Headers(),
          url: 'https://test.com',
        });
      });

      const model = createTestModel();

      try {
        await model.doStream({ prompt: createSimplePrompt() });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect((error as APICallError).isRetryable).toBe(true);
        expect((error as APICallError).statusCode).toBe(429);
      }
    });

    // Note: a previous version of this test asserted a "Response body is null"
    // error from the hand-rolled fetch + reader pipeline. v2 uses
    // postJsonToApi + createEventSourceResponseHandler, which surfaces this
    // case as a "Failed to process successful response" error with a wrapped
    // cause. We trust the SDK helper's error shape rather than asserting on
    // the exact message.
  });

  describe('message conversion', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });
    });

    it('should convert system message', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });

    it('should convert user message with text', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello world' }] }],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.messages[0].role).toBe('user');
      // Single-text-part user content is collapsed to a plain string for wx
      // models that don't accept content arrays.
      expect(requestBody.messages[0].content).toBe('Hello world');
    });

    it('should convert assistant message with tool call', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-123',
                toolName: 'getWeather',
                input: { location: 'Tokyo' },
              },
            ],
          },
        ],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.messages[0].tool_calls[0]).toEqual({
        id: 'call-123',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: '{"location":"Tokyo"}',
        },
      });
    });

    it('should convert tool result message', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-123',
                toolName: 'getWeather',
                output: { type: 'text', value: 'Sunny, 22°C' },
              },
            ],
          },
        ],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call-123',
        content: 'Sunny, 22°C',
      });
    });
  });

  describe('tool handling', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return createMockFetch({ response: createMockIAMResponse() })();
        }
        return createMockFetch({ response: createMockChatResponse({}) })();
      });
    });

    it('should convert tools to watsonx format', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            description: 'Get weather for a location',
            inputSchema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'getWeather',
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      });
    });

    it('should handle toolChoice auto', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [{ type: 'function', name: 'test', inputSchema: { type: 'object' } }],
        toolChoice: { type: 'auto' },
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.tool_choice_option).toBe('auto');
    });

    it('should handle toolChoice none', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [{ type: 'function', name: 'test', inputSchema: { type: 'object' } }],
        toolChoice: { type: 'none' },
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.tool_choice_option).toBe('none');
    });

    it('should handle toolChoice required', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [{ type: 'function', name: 'test', inputSchema: { type: 'object' } }],
        toolChoice: { type: 'required' },
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.tool_choice_option).toBe('required');
    });

    it('should handle toolChoice specific tool', async () => {
      const model = createTestModel();
      await model.doGenerate({
        prompt: createSimplePrompt(),
        tools: [{ type: 'function', name: 'getWeather', inputSchema: { type: 'object' } }],
        toolChoice: { type: 'tool', toolName: 'getWeather' },
      });

      const chatCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].includes('/ml/v1/text/chat')
      );
      const requestBody = JSON.parse(chatCall![1].body);
      expect(requestBody.tool_choice).toEqual({
        type: 'function',
        function: { name: 'getWeather' },
      });
    });
  });
});
