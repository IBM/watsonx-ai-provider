import type { LanguageModelV1 } from "@ai-sdk/provider";
import type { WatsonxChatModelId, WatsonxChatSettings } from "./watsonx-chat-settings";
import type WatsonxAiMlVml_v1 from "@ibm-cloud/watsonx-ai/dist/watsonx-ai-ml/vml_v1";
export interface WatsonxOptions extends WatsonxAiMlVml_v1.Options {
    projectId?: string;
}
export declare class WatsonxChatLanguageModel implements LanguageModelV1 {
    readonly specificationVersion = "v1";
    readonly defaultObjectGenerationMode = "json";
    readonly supportsImageUrls = false;
    readonly modelId: WatsonxChatModelId;
    readonly settings: WatsonxChatSettings;
    private readonly config;
    private readonly service;
    constructor(modelId: WatsonxChatModelId, settings: WatsonxChatSettings, config: WatsonxOptions);
    get provider(): string;
    private makeParams;
    doGenerate(options: Parameters<LanguageModelV1["doGenerate"]>[0]): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>>;
    doStream(options: Parameters<LanguageModelV1["doStream"]>[0]): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>>;
}
