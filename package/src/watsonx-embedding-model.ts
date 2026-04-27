import {
  type EmbeddingModelV3,
  type EmbeddingModelV3CallOptions,
  type EmbeddingModelV3Result,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  postJsonToApi,
  createJsonResponseHandler,
  combineHeaders,
} from '@ai-sdk/provider-utils';
import type {
  WatsonxEmbeddingModelId,
  WatsonxEmbeddingSettings,
} from './watsonx-embedding-settings';
import { type WatsonxConfig, WATSONX_API_VERSION } from './watsonx-config';
import { getIAMToken } from './watsonx-iam';
import { watsonxEmbeddingResponseSchema } from './watsonx-schemas';
import { watsonxErrorHandler } from './watsonx-error';

// --- Main Embedding Model Class ---

export class WatsonxEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3' as const;

  readonly modelId: WatsonxEmbeddingModelId;
  readonly settings: WatsonxEmbeddingSettings;
  private readonly config: WatsonxConfig;

  /**
   * Maximum number of embeddings per API call.
   * watsonx.ai supports batching multiple texts in a single request.
   */
  readonly maxEmbeddingsPerCall = 100;

  /**
   * Whether the model supports parallel embedding calls.
   */
  readonly supportsParallelCalls = true;

  constructor(
    modelId: WatsonxEmbeddingModelId,
    settings: WatsonxEmbeddingSettings,
    config: WatsonxConfig
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result> {
    if (options.values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values: options.values,
      });
    }

    const token = await getIAMToken(this.config.apiKey());

    const body: Record<string, unknown> = {
      model_id: this.modelId,
      project_id: this.config.projectId(),
      inputs: options.values,
    };

    // Add truncation parameter if enabled
    if (this.settings.truncateInputTokens) {
      body.parameters = {
        truncate_input_tokens: true,
      };
    }

    const { value: response, rawValue, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/ml/v1/text/embeddings?version=${WATSONX_API_VERSION}`,
      headers: combineHeaders(
        { Authorization: `Bearer ${token}` },
        this.config.headers(),
        options.headers
      ),
      body,
      failedResponseHandler: watsonxErrorHandler,
      successfulResponseHandler: createJsonResponseHandler(
        watsonxEmbeddingResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Calculate total tokens - prefer top-level count, fallback to summing results
    let totalTokens: number;
    if (response.input_token_count != null) {
      totalTokens = response.input_token_count;
    } else {
      totalTokens = 0;
      for (const result of response.results) {
        totalTokens += result.input_token_count ?? 0;
      }
    }

    return {
      embeddings: response.results.map((r) => r.embedding),
      usage: { tokens: totalTokens },
      response: {
        headers: responseHeaders,
        body: rawValue ?? response,
      },
      warnings: [],
    };
  }
}
