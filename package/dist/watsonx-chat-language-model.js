"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatsonxChatLanguageModel = void 0;
const map_watsonx_finish_reason_1 = require("./map-watsonx-finish-reason");
const watsonx_ai_1 = require("@ibm-cloud/watsonx-ai");
const watsonx_prepare_tools_1 = require("./watsonx-prepare-tools");
const convert_to_watsonx_chat_messages_1 = require("./convert-to-watsonx-chat-messages");
class WatsonxChatLanguageModel {
    constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.defaultObjectGenerationMode = "json";
        this.supportsImageUrls = false;
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
        this.service = watsonx_ai_1.WatsonXAI.newInstance(config);
    }
    get provider() {
        return this.config.provider;
    }
    makeParams(options) {
        const warnings = [];
        if (options.topK !== undefined)
            warnings.push({ type: "unsupported-setting", setting: "topK" });
        // todo: unmapped options
        // console.log(JSON.stringify(options, null, 2));
        // options.inputFormat;
        // options.providerMetadata;
        // options.responseFormat;
        const params = {
            frequencyPenalty: options.frequencyPenalty,
            headers: options.headers,
            // logitBias,
            // logprobs,
            maxTokens: options.maxTokens,
            messages: (0, convert_to_watsonx_chat_messages_1.convertToWatsonxChatMessages)(options.prompt),
            modelId: this.modelId,
            // n,
            presencePenalty: options.presencePenalty,
            projectId: this.config.projectId,
            // responseFormat,
            seed: options.seed,
            signal: options.abortSignal,
            // spaceId,
            stop: options.stopSequences,
            temperature: options.temperature,
            // timeLimit,
            // topLogprobs,
            topP: options.topP,
        };
        switch (options.mode.type) {
            case "regular": {
                const { tools, toolChoice, toolChoiceOption, toolWarnings } = (0, watsonx_prepare_tools_1.prepareTools)(options.mode);
                return {
                    params: {
                        ...params,
                        tools,
                        toolChoice,
                        toolChoiceOption,
                        temperature: tools ? 0 : params.temperature, // make the model more deterministic with tools
                    },
                    warnings: [...warnings, ...toolWarnings],
                };
            }
            case "object-json": {
                const { tools, toolChoice, toolChoiceOption, toolWarnings } = (0, watsonx_prepare_tools_1.prepareTools)({
                    ...options.mode,
                    type: "regular",
                });
                return {
                    params: {
                        ...params,
                        tools,
                        toolChoice,
                        toolChoiceOption,
                        temperature: tools ? 0 : params.temperature, // make the model more deterministic with tools
                        responseFormat: { type: "json_object" },
                    },
                    warnings: [...warnings, ...toolWarnings],
                };
            }
        }
        console.log("Unsupported mode type:", options.mode.type);
        return { params, warnings };
    }
    async doGenerate(options) {
        var _a, _b, _c, _d, _e, _f, _g;
        const { params, warnings } = this.makeParams(options);
        const rawChatResponse = await this.service.textChat(params);
        const choice = rawChatResponse.result.choices[0];
        const { messages: rawPrompt, ...rawSettings } = params;
        return {
            text: (_a = choice.message) === null || _a === void 0 ? void 0 : _a.content,
            toolCalls: (_c = (_b = choice.message) === null || _b === void 0 ? void 0 : _b.tool_calls) === null || _c === void 0 ? void 0 : _c.map((toolCall) => ({
                toolCallType: "function",
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                args: toolCall.function.arguments,
            })),
            finishReason: (0, map_watsonx_finish_reason_1.mapWatsonxFinishReason)(choice.finish_reason),
            usage: {
                promptTokens: (_e = (_d = rawChatResponse.result.usage) === null || _d === void 0 ? void 0 : _d.prompt_tokens) !== null && _e !== void 0 ? _e : Number.NaN,
                completionTokens: (_g = (_f = rawChatResponse.result.usage) === null || _f === void 0 ? void 0 : _f.completion_tokens) !== null && _g !== void 0 ? _g : Number.NaN,
            },
            rawCall: { rawPrompt, rawSettings },
            rawResponse: {
                headers: normalizeHeaders(rawChatResponse.headers),
                body: rawChatResponse.result,
            },
            request: { body: JSON.stringify(params) },
            warnings,
        };
    }
    async doStream(options) {
        const { params, warnings } = this.makeParams(options);
        const chatStreamObjects = await this.service.textChatStream({ ...params, returnObject: true });
        const { messages: rawPrompt, ...rawSettings } = params;
        let finishReason = "unknown";
        // the watsonx stream does not return the tool call id in every chunk, so we need to accumulate it
        let toolCallAcc = {
            toolCallId: "",
            toolName: "",
            args: "",
        };
        return {
            warnings,
            rawCall: { rawPrompt, rawSettings },
            request: { body: JSON.stringify(params) },
            stream: streamFromAsyncIterable(chatStreamObjects, (chunk) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                if ((_a = chunk.data.choices[0]) === null || _a === void 0 ? void 0 : _a.finish_reason) {
                    finishReason = (0, map_watsonx_finish_reason_1.mapWatsonxFinishReason)(chunk.data.choices[0].finish_reason);
                }
                if ((_d = (_c = (_b = chunk.data.choices[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.tool_calls) === null || _d === void 0 ? void 0 : _d.length) {
                    const toolCall = chunk.data.choices[0].delta.tool_calls[0];
                    if (toolCall.id)
                        toolCallAcc.toolCallId = toolCall.id;
                    if (toolCall.function.name)
                        toolCallAcc.toolName = toolCall.function.name;
                    if (toolCall.function.arguments)
                        toolCallAcc.args = toolCall.function.arguments;
                }
                if (chunk.data.usage) {
                    const finish = {
                        type: "finish",
                        finishReason,
                        usage: {
                            promptTokens: (_e = chunk.data.usage.prompt_tokens) !== null && _e !== void 0 ? _e : NaN,
                            completionTokens: (_f = chunk.data.usage.completion_tokens) !== null && _f !== void 0 ? _f : NaN,
                        },
                    };
                    if (toolCallAcc.toolCallId) {
                        return [{ ...toolCallAcc, type: "tool-call", toolCallType: "function" }, finish];
                    }
                    return [finish];
                }
                else {
                    return [
                        {
                            type: "text-delta",
                            textDelta: (_h = (_g = chunk.data.choices[0].delta) === null || _g === void 0 ? void 0 : _g.content) !== null && _h !== void 0 ? _h : "",
                        },
                    ];
                }
            }),
        };
    }
}
exports.WatsonxChatLanguageModel = WatsonxChatLanguageModel;
function normalizeHeaders(headers) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
            normalized[key] = value.join(", "); // Convert array to a comma-separated string
        }
        else if (value !== undefined) {
            normalized[key] = value;
        }
    }
    return normalized;
}
function streamFromAsyncIterable(iterable, transform) {
    return new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of iterable) {
                    const transformed = transform(chunk);
                    transformed.forEach((item) => controller.enqueue(item));
                }
                controller.close();
            }
            catch (err) {
                controller.error(err);
            }
        },
    });
}
