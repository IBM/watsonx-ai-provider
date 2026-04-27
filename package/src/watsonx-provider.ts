import {
  type LanguageModelV3,
  type EmbeddingModelV3,
  NoSuchModelError,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  withUserAgentSuffix,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { WatsonxChatLanguageModel } from './watsonx-chat-language-model';
import type { WatsonxChatModelId } from './watsonx-chat-settings';
import { WatsonxEmbeddingModel } from './watsonx-embedding-model';
import type { WatsonxEmbeddingModelId, WatsonxEmbeddingSettings } from './watsonx-embedding-settings';
import { VERSION as PROVIDER_VERSION } from './version';

export interface WatsonxProviderSettings {
  /**
   * IBM Cloud API key. Defaults to WATSONX_AI_APIKEY env variable.
   * Note: validation is lazy — a missing key does not throw until the first
   * model call, so `createWatsonx()` succeeds even without credentials.
   */
  apiKey?: string;

  /**
   * watsonx.ai project ID. Defaults to WATSONX_AI_PROJECT_ID env variable.
   * Lazily validated; see apiKey note.
   */
  projectId?: string;

  /**
   * Base URL for the watsonx.ai API.
   * Defaults to https://us-south.ml.cloud.ibm.com
   */
  baseURL?: string;

  /**
   * Custom headers to include in requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. Use to intercept requests for testing,
   * middleware, proxying, or telemetry.
   */
  fetch?: FetchFunction;

  /**
   * Custom ID generator for stream text/reasoning parts. Use to inject a
   * deterministic generator in tests; defaults to provider-utils `generateId`.
   */
  generateId?: () => string;
}

export interface WatsonxProvider extends ProviderV3 {
  (modelId: WatsonxChatModelId): LanguageModelV3;

  chat(modelId: WatsonxChatModelId): LanguageModelV3;

  languageModel(modelId: WatsonxChatModelId): LanguageModelV3;

  embeddingModel(modelId: WatsonxEmbeddingModelId): EmbeddingModelV3;

  /** @deprecated Use `embeddingModel` instead. */
  textEmbeddingModel(
    modelId: WatsonxEmbeddingModelId,
    settings?: WatsonxEmbeddingSettings
  ): EmbeddingModelV3;
}

export function createWatsonx(options: WatsonxProviderSettings = {}): WatsonxProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://us-south.ml.cloud.ibm.com';

  const getApiKey = () => {
    const apiKey = options.apiKey ?? process.env.WATSONX_AI_APIKEY;
    if (!apiKey) {
      throw new Error(
        'IBM Cloud API key is required. Set WATSONX_AI_APIKEY env variable or pass apiKey option.'
      );
    }
    return apiKey;
  };

  const getProjectId = () => {
    const projectId = options.projectId ?? process.env.WATSONX_AI_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'watsonx.ai project ID is required. Set WATSONX_AI_PROJECT_ID env variable or pass projectId option.'
      );
    }
    return projectId;
  };

  const getHeaders = () =>
    withUserAgentSuffix(
      { ...options.headers },
      `ai-sdk/watsonx/${PROVIDER_VERSION}`
    );

  const createChatModel = (modelId: WatsonxChatModelId): LanguageModelV3 => {
    return new WatsonxChatLanguageModel(modelId, {
      provider: 'watsonx.chat',
      baseURL,
      apiKey: getApiKey,
      projectId: getProjectId,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId,
    });
  };

  const createEmbeddingModel = (
    modelId: WatsonxEmbeddingModelId,
    settings: WatsonxEmbeddingSettings = {}
  ): EmbeddingModelV3 => {
    return new WatsonxEmbeddingModel(modelId, settings, {
      provider: 'watsonx.embedding',
      baseURL,
      apiKey: getApiKey,
      projectId: getProjectId,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = function (modelId: WatsonxChatModelId): LanguageModelV3 {
    if (new.target) {
      throw new Error(
        'The watsonx model function cannot be called with the `new` keyword.'
      );
    }
    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.chat = createChatModel;
  provider.languageModel = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as WatsonxProvider;
}

/**
 * Default watsonx provider instance. Reads credentials from WATSONX_AI_APIKEY
 * and WATSONX_AI_PROJECT_ID env variables.
 */
export const watsonx = createWatsonx();
