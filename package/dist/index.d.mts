import { ProviderV3, LanguageModelV3, EmbeddingModelV3, LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamResult, EmbeddingModelV3CallOptions, EmbeddingModelV3Result } from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { z } from 'zod';

type WatsonxChatModelId = 'openai/gpt-oss-120b' | 'ibm/granite-4-h-small' | 'ibm/granite-8b-code-instruct' | 'meta-llama/llama-3-3-70b-instruct' | 'meta-llama/llama-3-2-11b-vision-instruct' | 'meta-llama/llama-3-2-3b-instruct' | 'meta-llama/llama-3-2-1b-instruct' | 'mistralai/mistral-medium-2505' | 'mistralai/mistral-small-3-1-24b-instruct-2503' | 'mistralai/pixtral-12b' | (string & {});
/**
 * watsonx.ai-specific options passed via `providerOptions.watsonx` on a call.
 * Standard generation parameters (temperature, topP, topK, maxOutputTokens,
 * stopSequences) live on LanguageModelV3CallOptions and should be passed there.
 */
declare const watsonxLanguageModelOptions: z.ZodObject<{
    timeLimit: z.ZodOptional<z.ZodNumber>;
    parallelToolCalls: z.ZodOptional<z.ZodBoolean>;
    reasoningEffort: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
}, z.core.$strip>;
type WatsonxLanguageModelOptions = z.infer<typeof watsonxLanguageModelOptions>;

type WatsonxEmbeddingModelId = 'ibm/granite-embedding-107m-multilingual' | 'ibm/granite-embedding-278m-multilingual' | 'ibm/slate-125m-english-rtrvr-v2' | 'ibm/slate-30m-english-rtrvr-v2' | (string & {});
interface WatsonxEmbeddingSettings {
    /**
     * Whether to truncate input text to fit within the model's token limit.
     * When true, inputs exceeding the model's max tokens will be truncated.
     * When false or undefined, long inputs may cause an error.
     */
    truncateInputTokens?: boolean;
}

interface WatsonxProviderSettings {
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
interface WatsonxProvider extends ProviderV3 {
    (modelId: WatsonxChatModelId): LanguageModelV3;
    chat(modelId: WatsonxChatModelId): LanguageModelV3;
    languageModel(modelId: WatsonxChatModelId): LanguageModelV3;
    embeddingModel(modelId: WatsonxEmbeddingModelId): EmbeddingModelV3;
    /** @deprecated Use `embeddingModel` instead. */
    textEmbeddingModel(modelId: WatsonxEmbeddingModelId, settings?: WatsonxEmbeddingSettings): EmbeddingModelV3;
}
declare function createWatsonx(options?: WatsonxProviderSettings): WatsonxProvider;
/**
 * Default watsonx provider instance. Reads credentials from WATSONX_AI_APIKEY
 * and WATSONX_AI_PROJECT_ID env variables.
 */
declare const watsonx: WatsonxProvider;

declare const WATSONX_API_VERSION = "2026-04-20";
interface WatsonxConfig {
    provider: string;
    baseURL: string;
    apiKey: () => string;
    projectId: () => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
    generateId?: () => string;
}

declare class WatsonxChatLanguageModel implements LanguageModelV3 {
    readonly specificationVersion: "v3";
    readonly modelId: WatsonxChatModelId;
    private readonly config;
    readonly supportedUrls: Record<string, RegExp[]>;
    constructor(modelId: WatsonxChatModelId, config: WatsonxConfig);
    get provider(): string;
    private get generateId();
    private getArgs;
    doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult>;
    doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult>;
}

declare class WatsonxEmbeddingModel implements EmbeddingModelV3 {
    readonly specificationVersion: "v3";
    readonly modelId: WatsonxEmbeddingModelId;
    readonly settings: WatsonxEmbeddingSettings;
    private readonly config;
    /**
     * Maximum number of embeddings per API call.
     * watsonx.ai supports batching multiple texts in a single request.
     */
    readonly maxEmbeddingsPerCall = 100;
    /**
     * Whether the model supports parallel embedding calls.
     */
    readonly supportsParallelCalls = true;
    constructor(modelId: WatsonxEmbeddingModelId, settings: WatsonxEmbeddingSettings, config: WatsonxConfig);
    get provider(): string;
    doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result>;
}

export { WATSONX_API_VERSION, WatsonxChatLanguageModel, type WatsonxChatModelId, type WatsonxConfig, WatsonxEmbeddingModel, type WatsonxEmbeddingModelId, type WatsonxEmbeddingSettings, type WatsonxLanguageModelOptions, type WatsonxProvider, type WatsonxProviderSettings, createWatsonx, createWatsonx as createWatsonxProvider, watsonx, watsonxLanguageModelOptions };
