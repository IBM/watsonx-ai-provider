import { WatsonxChatLanguageModel, WatsonxOptions } from "./watsonx-chat-language-model";
import { WatsonxChatModelId, WatsonxChatSettings } from "./watsonx-chat-settings";
export interface CustomProvider {
    (modelId: WatsonxChatModelId, settings?: WatsonxChatSettings): WatsonxChatLanguageModel;
    chat(modelId: WatsonxChatModelId, settings?: WatsonxChatSettings): WatsonxChatLanguageModel;
}
export interface WatsonxProviderOptions extends WatsonxOptions {
}
export declare function createWatsonxProvider(options?: Partial<WatsonxProviderOptions>): CustomProvider;
export declare const watsonx: CustomProvider;
