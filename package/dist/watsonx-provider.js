"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watsonx = void 0;
exports.createWatsonxProvider = createWatsonxProvider;
const watsonx_chat_language_model_1 = require("./watsonx-chat-language-model");
// provider factory function
function createWatsonxProvider(options) {
    const createModel = (modelId, settings = {}) => new watsonx_chat_language_model_1.WatsonxChatLanguageModel(modelId, settings, {
        version: "2024-05-31",
        ...options,
    });
    const provider = function (modelId, settings) {
        if (new.target) {
            throw new Error("The model factory function cannot be called with the new keyword.");
        }
        return createModel(modelId, settings);
    };
    provider.chat = createModel;
    return provider;
}
// default provider instance
exports.watsonx = createWatsonxProvider();
