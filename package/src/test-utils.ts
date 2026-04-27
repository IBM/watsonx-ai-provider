import { vi } from 'vitest';

/**
 * Creates a mock fetch response for testing API calls.
 */
export function createMockFetch(options: {
  response?: object;
  status?: number;
  headers?: Record<string, string>;
  throwError?: Error;
}) {
  const { response = {}, status = 200, headers = {}, throwError } = options;

  if (throwError) {
    return vi.fn().mockRejectedValue(throwError);
  }

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: new Headers(headers),
    url: 'https://us-south.ml.cloud.ibm.com/ml/v1/text/chat',
  });
}

/**
 * Creates a mock streaming response for SSE testing.
 * Simulates proper SSE chunked delivery where each chunk is delivered one at a time.
 */
export function createMockStreamFetch(options: {
  chunks: string[];
  status?: number;
  headers?: Record<string, string>;
}) {
  const { chunks, status = 200, headers = {} } = options;

  return vi.fn().mockImplementation(() => {
    let chunkIndex = 0;

    // Create a fresh readable stream for each call
    const stream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue(new TextEncoder().encode(chunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(chunks.join('')),
      headers: new Headers(headers),
      url: 'https://us-south.ml.cloud.ibm.com/ml/v1/text/chat_stream',
      body: stream,
    });
  });
}

/**
 * Creates SSE formatted data lines for streaming tests.
 */
export function createSSEChunk(data: object | string): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `data: ${payload}\n\n`;
}

/**
 * Standard mock chat response from watsonx.ai.
 */
export function createMockChatResponse(options: {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const {
    content = 'Hello!',
    toolCalls,
    finishReason = 'stop',
    promptTokens = 10,
    completionTokens = 5,
  } = options;

  return {
    id: 'test-response-id',
    model_id: 'ibm/granite-4-h-small',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: toolCalls ? null : content,
          tool_calls: toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

/**
 * Standard mock embedding response from watsonx.ai.
 */
export function createMockEmbeddingResponse(options: {
  embeddings: number[][];
  inputTokenCount?: number;
}) {
  const { embeddings, inputTokenCount } = options;

  return {
    model_id: 'ibm/granite-embedding-107m-multilingual',
    results: embeddings.map((embedding) => ({
      embedding,
      input_token_count: inputTokenCount ? Math.floor(inputTokenCount / embeddings.length) : undefined,
    })),
    input_token_count: inputTokenCount,
  };
}

/**
 * Mock IAM token response.
 */
export function createMockIAMResponse(options?: {
  token?: string;
  expiresIn?: number;
}) {
  const { token = 'mock-iam-token', expiresIn = 3600 } = options ?? {};

  return {
    access_token: token,
    expires_in: expiresIn,
    token_type: 'Bearer',
  };
}

/**
 * Standard watsonx.ai error response.
 */
export function createMockErrorResponse(options: {
  code?: string;
  message?: string;
  statusCode?: number;
}) {
  const {
    code = 'invalid_request',
    message = 'An error occurred',
    statusCode = 400,
  } = options;

  return {
    errors: [
      {
        code,
        message,
      },
    ],
    status_code: statusCode,
  };
}

/**
 * Test configuration for creating chat-model instances.
 */
export const TEST_CONFIG = {
  provider: 'watsonx.chat',
  baseURL: 'https://us-south.ml.cloud.ibm.com',
  apiKey: () => 'test-api-key',
  projectId: () => 'test-project-id',
  headers: () => ({}),
};

/**
 * Test configuration for creating embedding-model instances.
 */
export const TEST_EMBEDDING_CONFIG = {
  provider: 'watsonx.embedding',
  baseURL: 'https://us-south.ml.cloud.ibm.com',
  apiKey: () => 'test-api-key',
  projectId: () => 'test-project-id',
  headers: () => ({}),
};
