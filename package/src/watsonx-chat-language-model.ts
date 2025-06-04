import type {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import { mapWatsonxFinishReason } from "./map-watsonx-finish-reason";
import type { WatsonxChatModelId, WatsonxChatSettings } from "./watsonx-chat-settings";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import type WatsonxAiMlVml_v1 from "@ibm-cloud/watsonx-ai/dist/watsonx-ai-ml/vml_v1";
import type { IncomingHttpHeaders } from "http";
import { prepareTools } from "./watsonx-prepare-tools";
import { convertToWatsonxChatMessages } from "./convert-to-watsonx-chat-messages";

export interface WatsonxOptions extends WatsonxAiMlVml_v1.Options {
  projectId?: string;
}

export class WatsonxChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = "v1";
  readonly defaultObjectGenerationMode = "json";
  readonly supportsImageUrls = false;

  readonly modelId: WatsonxChatModelId;
  readonly settings: WatsonxChatSettings;

  private readonly config: WatsonxOptions;
  private readonly service: WatsonXAI;

  constructor(modelId: WatsonxChatModelId, settings: WatsonxChatSettings, config: WatsonxOptions) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.service = WatsonXAI.newInstance(config);
  }

  get provider(): string {
    return this.config.provider;
  }

  private makeParams(options: Parameters<LanguageModelV1["doGenerate"]>[0]): {
    params: WatsonXAI.TextChatParams;
    warnings: LanguageModelV1CallWarning[];
  } {
    const warnings: LanguageModelV1CallWarning[] = [];
    if (options.topK !== undefined) warnings.push({ type: "unsupported-setting", setting: "topK" });
    // todo: unmapped options
    // console.log(JSON.stringify(options, null, 2));
    // options.inputFormat;
    // options.providerMetadata;
    // options.responseFormat;

    const params: WatsonxAiMlVml_v1.TextChatParams = {
      frequencyPenalty: options.frequencyPenalty,
      headers: options.headers,
      // logitBias,
      // logprobs,
      maxTokens: options.maxTokens,
      messages: convertToWatsonxChatMessages(options.prompt),
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
        const { tools, toolChoice, toolChoiceOption, toolWarnings } = prepareTools(options.mode);
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
        const { tools, toolChoice, toolChoiceOption, toolWarnings } = prepareTools({
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

  async doGenerate(
    options: Parameters<LanguageModelV1["doGenerate"]>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
    const { params, warnings } = this.makeParams(options);

    const rawChatResponse = await this.service.textChat(params);
    const choice = rawChatResponse.result.choices[0];
    const { messages: rawPrompt, ...rawSettings } = params;

    return {
      text: choice.message?.content,
      toolCalls: choice.message?.tool_calls?.map((toolCall) => ({
        toolCallType: "function",
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
      })),
      finishReason: mapWatsonxFinishReason(choice.finish_reason),
      usage: {
        promptTokens: rawChatResponse.result.usage?.prompt_tokens ?? Number.NaN,
        completionTokens: rawChatResponse.result.usage?.completion_tokens ?? Number.NaN,
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

  async doStream(
    options: Parameters<LanguageModelV1["doStream"]>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
    const { params, warnings } = this.makeParams(options);

    const chatStreamObjects = await this.service.textChatStream({ ...params, returnObject: true });

    const { messages: rawPrompt, ...rawSettings } = params;
    let finishReason: LanguageModelV1FinishReason = "unknown";

    // the watsonx stream does not return the tool call id in every chunk, so we need to accumulate it
    let toolCallAcc: { toolCallId: string; toolName: string; args: string } = {
      toolCallId: "",
      toolName: "",
      args: "",
    };

    return {
      warnings,
      rawCall: { rawPrompt, rawSettings },
      request: { body: JSON.stringify(params) },
      stream: streamFromAsyncIterable(chatStreamObjects, (chunk): LanguageModelV1StreamPart[] => {
        if (chunk.data.choices[0]?.finish_reason) {
          finishReason = mapWatsonxFinishReason(chunk.data.choices[0].finish_reason);
        }
        if (chunk.data.choices[0]?.delta?.tool_calls?.length) {
          const toolCall = chunk.data.choices[0].delta.tool_calls[0];
          if (toolCall.id) toolCallAcc.toolCallId = toolCall.id;
          if (toolCall.function.name) toolCallAcc.toolName = toolCall.function.name;
          if (toolCall.function.arguments) toolCallAcc.args = toolCall.function.arguments;
        }
        if (chunk.data.usage) {
          const finish = {
            type: "finish" as const,
            finishReason,
            usage: {
              promptTokens: chunk.data.usage.prompt_tokens ?? NaN,
              completionTokens: chunk.data.usage.completion_tokens ?? NaN,
            },
          };
          if (toolCallAcc.toolCallId) {
            return [{ ...toolCallAcc, type: "tool-call", toolCallType: "function" }, finish];
          }
          return [finish];
        } else {
          return [
            {
              type: "text-delta",
              textDelta: chunk.data.choices[0].delta?.content ?? "",
            },
          ];
        }
      }),
    };
  }
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(", "); // Convert array to a comma-separated string
    } else if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function streamFromAsyncIterable<T, U>(iterable: AsyncIterable<T>, transform: (chunk: T) => U[]): ReadableStream<U> {
  return new ReadableStream<U>({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          const transformed = transform(chunk);
          transformed.forEach((item) => controller.enqueue(item));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
