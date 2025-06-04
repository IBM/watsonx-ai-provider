import { WatsonxChatLanguageModel, WatsonxOptions } from "./watsonx-chat-language-model";
import { WatsonxChatModelId, WatsonxChatSettings } from "./watsonx-chat-settings";

// model factory function with additional methods and properties
export interface CustomProvider {
  (modelId: WatsonxChatModelId, settings?: WatsonxChatSettings): WatsonxChatLanguageModel;

  // explicit method for targeting a specific API in case there are several
  chat(modelId: WatsonxChatModelId, settings?: WatsonxChatSettings): WatsonxChatLanguageModel;
}

// optional settings for the provider
export interface WatsonxProviderOptions extends WatsonxOptions {}

// provider factory function
export function createWatsonxProvider(options?: Partial<WatsonxProviderOptions>): CustomProvider {
  const createModel = (modelId: WatsonxChatModelId, settings: WatsonxChatSettings = {}) =>
    new WatsonxChatLanguageModel(modelId, settings, {
      version: "2024-05-31",
      ...options,
    });

  const provider = function (modelId: WatsonxChatModelId, settings?: WatsonxChatSettings) {
    if (new.target) {
      throw new Error("The model factory function cannot be called with the new keyword.");
    }

    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider;
}

// default provider instance
export const watsonx = createWatsonxProvider();
