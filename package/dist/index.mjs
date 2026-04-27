// src/watsonx-provider.ts
import {
  NoSuchModelError
} from "@ai-sdk/provider";
import {
  withUserAgentSuffix,
  withoutTrailingSlash
} from "@ai-sdk/provider-utils";

// src/watsonx-chat-language-model.ts
import {
  APICallError
} from "@ai-sdk/provider";
import {
  postJsonToApi,
  createJsonResponseHandler,
  createEventSourceResponseHandler,
  generateId as defaultGenerateId,
  parseProviderOptions,
  combineHeaders
} from "@ai-sdk/provider-utils";

// src/watsonx-chat-settings.ts
import { z } from "zod";
var watsonxLanguageModelOptions = z.object({
  /**
   * Maximum wall-clock time in milliseconds the server will spend on this
   * request before aborting. Unique to watsonx.ai.
   */
  timeLimit: z.number().optional(),
  /**
   * Whether the model may call multiple tools in parallel within one response.
   * Forwarded to wx.ai as `parallel_tool_calls`. Defaults to the model's native
   * behavior (usually true) when unset.
   */
  parallelToolCalls: z.boolean().optional(),
  /**
   * Reasoning effort for reasoning-capable models. Forwarded to wx.ai as
   * `reasoning_effort`. Verified to scale chain-of-thought length on
   * `openai/gpt-oss-120b` (HIGH produces ~3× the reasoning of LOW).
   *
   * Models without reasoning capability (e.g. `ibm/granite-4-h-small`)
   * accept the field but produce no `reasoning_content` regardless.
   */
  reasoningEffort: z.enum(["low", "medium", "high"]).optional()
});

// src/watsonx-config.ts
var WATSONX_API_VERSION = "2026-04-20";

// src/watsonx-iam.ts
import { LoadAPIKeyError } from "@ai-sdk/provider";
var tokenCache = /* @__PURE__ */ new Map();
var pendingRequests = /* @__PURE__ */ new Map();
async function getIAMToken(apiKey) {
  const cached = tokenCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1e3) {
    return cached.token;
  }
  const pending = pendingRequests.get(apiKey);
  if (pending) {
    return pending;
  }
  const fetchPromise = fetchIAMToken(apiKey);
  pendingRequests.set(apiKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    pendingRequests.delete(apiKey);
  }
}
async function fetchIAMToken(apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15e3);
  let response;
  try {
    response = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: apiKey
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new LoadAPIKeyError({
      message: `Failed to get IBM IAM token: ${response.status} - ${text}`
    });
  }
  const data = await response.json();
  tokenCache.set(apiKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1e3
  });
  return data.access_token;
}
function invalidateIAMToken(apiKey) {
  tokenCache.delete(apiKey);
}

// src/watsonx-schemas.ts
import { z as z2 } from "zod";
var watsonxErrorSchema = z2.object({
  errors: z2.array(
    z2.object({
      code: z2.string(),
      message: z2.string(),
      more_info: z2.string().optional()
    }).loose()
  ).optional(),
  error: z2.string().optional(),
  message: z2.string().optional(),
  // wx.ai variants return either; coerce to one via preprocess.
  statusCode: z2.number().optional()
}).loose().transform((val) => {
  const raw = val;
  return { ...val, statusCode: val.statusCode ?? raw.status_code };
});
var watsonxChatResponseSchema = z2.object({
  id: z2.string().nullish(),
  model_id: z2.string().nullish(),
  created: z2.number().nullish(),
  choices: z2.array(
    z2.object({
      index: z2.number(),
      message: z2.object({
        role: z2.literal("assistant"),
        content: z2.string().nullish(),
        reasoning_content: z2.string().nullish(),
        tool_calls: z2.array(
          z2.object({
            id: z2.string(),
            type: z2.literal("function"),
            function: z2.object({
              name: z2.string(),
              arguments: z2.string()
            }).loose()
          }).loose()
        ).optional()
      }).loose(),
      finish_reason: z2.string().nullish()
    }).loose()
  ),
  usage: z2.object({
    prompt_tokens: z2.number(),
    completion_tokens: z2.number(),
    total_tokens: z2.number(),
    completion_tokens_details: z2.object({ reasoning_tokens: z2.number().optional() }).loose().optional()
  }).loose()
});
var watsonxChatChunkSchema = z2.object({
  id: z2.string().nullish(),
  model_id: z2.string().nullish(),
  created: z2.number().nullish(),
  choices: z2.array(
    z2.object({
      index: z2.number().optional(),
      delta: z2.object({
        role: z2.string().optional(),
        content: z2.string().nullish(),
        reasoning_content: z2.string().nullish(),
        tool_calls: z2.array(
          z2.object({
            index: z2.number().optional(),
            id: z2.string().optional(),
            type: z2.string().optional(),
            function: z2.object({
              name: z2.string().optional(),
              arguments: z2.string().optional()
            }).loose().optional()
          }).loose()
        ).optional()
      }).loose().optional(),
      finish_reason: z2.string().nullish()
    }).loose()
  ).optional(),
  usage: z2.object({
    prompt_tokens: z2.number(),
    completion_tokens: z2.number(),
    total_tokens: z2.number().optional(),
    completion_tokens_details: z2.object({ reasoning_tokens: z2.number().optional() }).loose().optional()
  }).loose().optional()
});
var watsonxEmbeddingResponseSchema = z2.object({
  model_id: z2.string().nullish(),
  results: z2.array(
    z2.object({
      embedding: z2.array(z2.number()),
      input_token_count: z2.number().optional()
    }).loose()
  ),
  input_token_count: z2.number().optional()
});

// src/watsonx-error.ts
import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
var watsonxErrorHandler = createJsonErrorResponseHandler({
  errorSchema: watsonxErrorSchema,
  errorToMessage: (error) => {
    if (error.errors?.[0]?.message) {
      return error.errors[0].message;
    }
    return error.message ?? error.error ?? "Unknown watsonx.ai error";
  },
  isRetryable: (response, error) => {
    if (response.status === 429) return true;
    if (response.status >= 500) return true;
    const code = error?.errors?.[0]?.code;
    if (code === "rate_limit_exceeded" || code === "service_unavailable")
      return true;
    return false;
  }
});

// src/watsonx-chat-messages.ts
import {
  UnsupportedFunctionalityError
} from "@ai-sdk/provider";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";
function convertToWatsonxMessages(options) {
  const messages = [];
  for (const message of options.prompt) {
    switch (message.role) {
      case "system":
        messages.push({ role: "system", content: message.content });
        break;
      case "user": {
        const parts = [];
        for (const part of message.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "file") {
            if (!part.mediaType.startsWith("image/")) {
              throw new UnsupportedFunctionalityError({
                functionality: `file parts with media type ${part.mediaType}`,
                message: "watsonx.ai chat only supports image file parts; other media types are not supported."
              });
            }
            let imageUrl;
            if (part.data instanceof URL) {
              imageUrl = part.data.toString();
            } else if (typeof part.data === "string") {
              imageUrl = part.data.startsWith("data:") || part.data.startsWith("http") ? part.data : `data:${part.mediaType};base64,${part.data}`;
            } else if (part.data instanceof Uint8Array) {
              const base64 = convertUint8ArrayToBase64(part.data);
              imageUrl = `data:${part.mediaType};base64,${base64}`;
            } else {
              throw new UnsupportedFunctionalityError({
                functionality: "file part with unknown data shape"
              });
            }
            parts.push({ type: "image_url", image_url: { url: imageUrl } });
          }
        }
        if (parts.length === 1 && parts[0].type === "text") {
          messages.push({ role: "user", content: parts[0].text ?? "" });
        } else {
          messages.push({ role: "user", content: parts });
        }
        break;
      }
      case "assistant": {
        const toolCalls = [];
        let textContent = "";
        for (const part of message.content) {
          if (part.type === "text") {
            textContent += part.text;
          } else if (part.type === "tool-call") {
            toolCalls.push({
              id: part.toolCallId,
              type: "function",
              function: {
                name: part.toolName,
                arguments: typeof part.input === "string" ? part.input : JSON.stringify(part.input)
              }
            });
          }
        }
        const msg = { role: "assistant" };
        if (textContent) msg.content = textContent;
        if (toolCalls.length > 0) msg.tool_calls = toolCalls;
        messages.push(msg);
        break;
      }
      case "tool":
        for (const part of message.content) {
          if (part.type === "tool-result") {
            let resultContent;
            if (part.output.type === "text") {
              resultContent = part.output.value;
            } else if (part.output.type === "json") {
              resultContent = JSON.stringify(part.output.value);
            } else if (part.output.type === "error-text") {
              resultContent = part.output.value;
            } else if (part.output.type === "error-json") {
              resultContent = JSON.stringify(part.output.value);
            } else {
              resultContent = JSON.stringify(part.output);
            }
            messages.push({
              role: "tool",
              tool_call_id: part.toolCallId,
              content: resultContent
            });
          }
        }
        break;
    }
  }
  return messages;
}

// src/watsonx-prepare-tools.ts
function prepareWatsonxTools(options) {
  const toolWarnings = [];
  if (!options.tools || options.tools.length === 0) {
    return { toolWarnings };
  }
  for (const tool of options.tools) {
    if (tool.type !== "function") {
      toolWarnings.push({
        type: "unsupported",
        feature: `tool type '${tool.type}'`,
        details: "watsonx.ai only supports function tools"
      });
    }
  }
  const tools = options.tools.filter((tool) => tool.type === "function").map((tool) => {
    const fn = {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    };
    const strict = tool.strict;
    if (strict != null) fn.strict = strict;
    return { type: "function", function: fn };
  });
  let toolChoice;
  if (options.toolChoice) {
    switch (options.toolChoice.type) {
      case "auto":
      case "none":
      case "required":
        toolChoice = { tool_choice_option: options.toolChoice.type };
        break;
      case "tool":
        toolChoice = {
          tool_choice: {
            type: "function",
            function: { name: options.toolChoice.toolName }
          }
        };
        break;
    }
  }
  return { tools, toolChoice, toolWarnings };
}

// src/watsonx-chat-helpers.ts
function getResponseMetadata(value) {
  return {
    id: value.id ?? void 0,
    modelId: value.model_id ?? void 0,
    timestamp: typeof value.created === "number" ? new Date(value.created * 1e3) : void 0
  };
}
function convertFinishReason(reason, hasToolCalls = false) {
  let unified;
  switch (reason) {
    case "stop":
    case "eos_token":
      unified = "stop";
      break;
    case "length":
    case "max_tokens":
      unified = "length";
      break;
    case "tool_calls":
      unified = "tool-calls";
      break;
    case "content_filter":
      unified = "content-filter";
      break;
    default:
      unified = "other";
  }
  if (unified === "other" && hasToolCalls) {
    unified = "tool-calls";
  }
  return { unified, raw: reason };
}
function parseToolCallArgs(args, modelId) {
  if (modelId == null || !modelId.startsWith("ibm/granite")) {
    return args;
  }
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === "string") {
      return parsed;
    }
  } catch {
  }
  return args;
}
function convertUsage(usage) {
  if (usage == null) {
    return {
      inputTokens: {
        total: 0,
        noCache: void 0,
        cacheRead: void 0,
        cacheWrite: void 0
      },
      outputTokens: { total: 0, text: void 0, reasoning: void 0 }
    };
  }
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  const textTokens = reasoningTokens != null ? Math.max(0, usage.completion_tokens - reasoningTokens) : usage.completion_tokens;
  return {
    inputTokens: {
      total: usage.prompt_tokens,
      noCache: void 0,
      cacheRead: void 0,
      cacheWrite: void 0
    },
    outputTokens: {
      total: usage.completion_tokens,
      text: textTokens,
      reasoning: reasoningTokens
    },
    raw: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens
    }
  };
}

// src/watsonx-chat-language-model.ts
var WatsonxChatLanguageModel = class {
  specificationVersion = "v3";
  modelId;
  config;
  // Vision-capable wx models accept https image URLs directly; non-vision
  // models will surface an error from the backend when sent one.
  supportedUrls = {
    "image/*": [/^https?:\/\/.*$/]
  };
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  get generateId() {
    return this.config.generateId ?? defaultGenerateId;
  }
  async getArgs(options) {
    const warnings = [];
    if (options.frequencyPenalty != null) {
      warnings.push({ type: "unsupported", feature: "frequencyPenalty" });
    }
    if (options.presencePenalty != null) {
      warnings.push({ type: "unsupported", feature: "presencePenalty" });
    }
    if (options.seed != null) {
      warnings.push({ type: "unsupported", feature: "seed" });
    }
    const watsonxOptions = await parseProviderOptions({
      provider: "watsonx",
      providerOptions: options.providerOptions,
      schema: watsonxLanguageModelOptions
    });
    const messages = convertToWatsonxMessages(options);
    const body = {
      model_id: this.modelId,
      project_id: this.config.projectId(),
      messages,
      max_tokens: options.maxOutputTokens
    };
    if (options.temperature != null) {
      body.temperature = options.temperature;
    }
    if (options.topP != null) {
      body.top_p = options.topP;
    }
    if (options.topK != null) {
      body.top_k = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      const WX_STOP_SEQUENCE_SOFT_CAP = 4;
      if (options.stopSequences.length > WX_STOP_SEQUENCE_SOFT_CAP) {
        warnings.push({
          type: "other",
          message: `stopSequences has ${options.stopSequences.length} entries; wx.ai may reject more than ${WX_STOP_SEQUENCE_SOFT_CAP} depending on the model family.`
        });
      }
      body.stop_sequences = options.stopSequences;
    }
    if (watsonxOptions?.timeLimit != null) {
      body.time_limit = watsonxOptions.timeLimit;
    }
    if (watsonxOptions?.reasoningEffort != null) {
      body.reasoning_effort = watsonxOptions.reasoningEffort;
    }
    if (options.responseFormat?.type === "json") {
      if (options.responseFormat.schema != null) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: options.responseFormat.name ?? "response",
            description: options.responseFormat.description,
            schema: options.responseFormat.schema
          }
        };
      } else {
        body.response_format = { type: "json_object" };
      }
    }
    const { tools, toolChoice, toolWarnings } = prepareWatsonxTools(options);
    warnings.push(...toolWarnings);
    if (tools && tools.length > 0) {
      body.tools = tools;
      if (toolChoice) Object.assign(body, toolChoice);
      if (watsonxOptions?.parallelToolCalls != null) {
        body.parallel_tool_calls = watsonxOptions.parallelToolCalls;
      }
    }
    return { body, warnings };
  }
  async doGenerate(options) {
    const { body, warnings } = await this.getArgs(options);
    const apiKey = this.config.apiKey();
    const call = async () => {
      const token = await getIAMToken(apiKey);
      return postJsonToApi({
        url: `${this.config.baseURL}/ml/v1/text/chat?version=${WATSONX_API_VERSION}`,
        headers: combineHeaders(
          { Authorization: `Bearer ${token}` },
          this.config.headers(),
          options.headers
        ),
        body,
        failedResponseHandler: watsonxErrorHandler,
        successfulResponseHandler: createJsonResponseHandler(watsonxChatResponseSchema),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch
      });
    };
    let value;
    let rawValue;
    let responseHeaders;
    try {
      ({ value, rawValue, responseHeaders } = await call());
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode === 401) {
        invalidateIAMToken(apiKey);
        ({ value, rawValue, responseHeaders } = await call());
      } else {
        throw error;
      }
    }
    const response = value;
    const choice = response.choices[0];
    if (!choice) {
      throw new APICallError({
        message: "No choices returned from watsonx.ai",
        url: `${this.config.baseURL}/ml/v1/text/chat?version=${WATSONX_API_VERSION}`,
        requestBodyValues: body,
        isRetryable: false
      });
    }
    const content = [];
    if (choice.message.reasoning_content) {
      content.push({ type: "reasoning", text: choice.message.reasoning_content });
    }
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.function.name,
          input: parseToolCallArgs(tc.function.arguments, this.modelId)
        });
      }
    }
    const hasToolCalls = (choice.message.tool_calls?.length ?? 0) > 0;
    return {
      content,
      finishReason: convertFinishReason(choice.finish_reason ?? "stop", hasToolCalls),
      usage: convertUsage(response.usage),
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawValue ?? response
      },
      warnings
    };
  }
  async doStream(options) {
    const { body, warnings } = await this.getArgs(options);
    const apiKey = this.config.apiKey();
    const generateId = this.generateId;
    const INITIAL_STALL_MS = 12e4;
    const STREAMING_STALL_MS = 3e4;
    const stallController = new AbortController();
    const composedSignal = options.abortSignal ? AbortSignal.any([options.abortSignal, stallController.signal]) : stallController.signal;
    const call = async () => {
      const token = await getIAMToken(apiKey);
      return postJsonToApi({
        url: `${this.config.baseURL}/ml/v1/text/chat_stream?version=${WATSONX_API_VERSION}`,
        headers: combineHeaders(
          { Authorization: `Bearer ${token}` },
          this.config.headers(),
          options.headers
        ),
        body,
        failedResponseHandler: watsonxErrorHandler,
        successfulResponseHandler: createEventSourceResponseHandler(
          watsonxChatChunkSchema
        ),
        abortSignal: composedSignal,
        fetch: this.config.fetch
      });
    };
    let result;
    try {
      result = await call();
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode === 401) {
        invalidateIAMToken(apiKey);
        result = await call();
      } else {
        throw error;
      }
    }
    const { value: source, responseHeaders } = result;
    let usage = {
      inputTokens: { total: 0, noCache: void 0, cacheRead: void 0, cacheWrite: void 0 },
      outputTokens: { total: 0, text: void 0, reasoning: void 0 }
    };
    let finishReason = {
      unified: "other",
      raw: void 0
    };
    const toolCallsInProgress = /* @__PURE__ */ new Map();
    let textId = null;
    let reasoningId = null;
    let sentResponseMetadata = false;
    let receivedContent = false;
    let finalized = false;
    let responseId;
    let receivedFinishReason = false;
    let stallTimer;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      const ms = receivedContent ? STREAMING_STALL_MS : INITIAL_STALL_MS;
      stallTimer = setTimeout(() => {
        stallController.abort(
          new Error(
            `watsonx stream stalled: no data for ${ms / 1e3}s (contentStarted=${receivedContent})`
          )
        );
      }, ms);
    };
    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = void 0;
      }
    };
    const finalize = (controller) => {
      if (finalized) return;
      finalized = true;
      clearStall();
      if (reasoningId !== null) {
        controller.enqueue({ type: "reasoning-end", id: reasoningId });
      }
      if (textId !== null) {
        controller.enqueue({ type: "text-end", id: textId });
      }
      for (const [, tc] of toolCallsInProgress) {
        controller.enqueue({ type: "tool-input-end", id: tc.id });
        controller.enqueue({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.name,
          input: parseToolCallArgs(tc.args, this.modelId)
        });
      }
      const finalFinishReason = toolCallsInProgress.size > 0 && finishReason.unified !== "tool-calls" ? { unified: "tool-calls", raw: finishReason.raw } : finishReason;
      const completionTokens = usage.outputTokens?.total ?? 0;
      if (!receivedContent && completionTokens > 0) {
        console.warn(
          `[watsonx] stream anomaly: model=${this.modelId} response_id=${responseId ?? "unknown"} reported completion_tokens=${completionTokens} but streamed no content/tool_calls. Likely a wx.ai streaming bug. Finish reason received: ${receivedFinishReason}.`
        );
      }
      controller.enqueue({ type: "finish", finishReason: finalFinishReason, usage });
    };
    const stream = source.pipeThrough(
      new TransformStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings });
          armStall();
        },
        transform(chunk, controller) {
          if (finalized) return;
          armStall();
          if (process.env.WATSONX_DEBUG_STREAM) {
            if (chunk.success) {
              console.log("[watsonx chunk]", JSON.stringify(chunk.rawValue));
            } else {
              console.log(
                "[watsonx chunk parse-fail]",
                chunk.error,
                "raw:",
                JSON.stringify(chunk.rawValue)
              );
            }
          }
          if (options.includeRawChunks) {
            controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
          }
          if (!chunk.success) {
            controller.enqueue({ type: "error", error: chunk.error });
            return;
          }
          const value = chunk.value;
          if (!sentResponseMetadata) {
            sentResponseMetadata = true;
            const meta = getResponseMetadata(value);
            responseId = meta.id;
            controller.enqueue({
              type: "response-metadata",
              ...meta,
              timestamp: meta.timestamp ?? /* @__PURE__ */ new Date()
            });
          }
          if (value.usage != null) {
            usage = convertUsage(value.usage);
          }
          const choice = value.choices?.[0];
          if (!choice) return;
          if (choice.delta?.reasoning_content) {
            receivedContent = true;
            if (reasoningId === null) {
              reasoningId = `reasoning-${generateId()}`;
              controller.enqueue({ type: "reasoning-start", id: reasoningId });
            }
            controller.enqueue({
              type: "reasoning-delta",
              id: reasoningId,
              delta: choice.delta.reasoning_content
            });
          }
          if (choice.delta?.content) {
            receivedContent = true;
            if (textId === null) {
              textId = `text-${generateId()}`;
              controller.enqueue({ type: "text-start", id: textId });
            }
            controller.enqueue({
              type: "text-delta",
              id: textId,
              delta: choice.delta.content
            });
          }
          if (choice.delta?.tool_calls) {
            receivedContent = true;
            for (const tc of choice.delta.tool_calls) {
              const toolIndex = tc.index ?? 0;
              let existing = toolCallsInProgress.get(toolIndex);
              if (!existing) {
                existing = {
                  id: tc.id ?? `tool-${toolIndex}`,
                  name: "",
                  args: ""
                };
                toolCallsInProgress.set(toolIndex, existing);
              }
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name && existing.name === "") {
                existing.name = tc.function.name;
                controller.enqueue({
                  type: "tool-input-start",
                  id: existing.id,
                  toolName: existing.name
                });
              }
              if (tc.function?.arguments) {
                existing.args += tc.function.arguments;
                controller.enqueue({
                  type: "tool-input-delta",
                  id: existing.id,
                  delta: tc.function.arguments
                });
              }
            }
          }
          if (choice.finish_reason) {
            finishReason = convertFinishReason(choice.finish_reason);
            receivedFinishReason = true;
            finalize(controller);
            controller.terminate();
          }
        },
        flush(controller) {
          finalize(controller);
        }
      })
    );
    return {
      stream,
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};

// src/watsonx-embedding-model.ts
import {
  TooManyEmbeddingValuesForCallError
} from "@ai-sdk/provider";
import {
  postJsonToApi as postJsonToApi2,
  createJsonResponseHandler as createJsonResponseHandler2,
  combineHeaders as combineHeaders2
} from "@ai-sdk/provider-utils";
var WatsonxEmbeddingModel = class {
  specificationVersion = "v3";
  modelId;
  settings;
  config;
  /**
   * Maximum number of embeddings per API call.
   * watsonx.ai supports batching multiple texts in a single request.
   */
  maxEmbeddingsPerCall = 100;
  /**
   * Whether the model supports parallel embedding calls.
   */
  supportsParallelCalls = true;
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  async doEmbed(options) {
    if (options.values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values: options.values
      });
    }
    const token = await getIAMToken(this.config.apiKey());
    const body = {
      model_id: this.modelId,
      project_id: this.config.projectId(),
      inputs: options.values
    };
    if (this.settings.truncateInputTokens) {
      body.parameters = {
        truncate_input_tokens: true
      };
    }
    const { value: response, rawValue, responseHeaders } = await postJsonToApi2({
      url: `${this.config.baseURL}/ml/v1/text/embeddings?version=${WATSONX_API_VERSION}`,
      headers: combineHeaders2(
        { Authorization: `Bearer ${token}` },
        this.config.headers(),
        options.headers
      ),
      body,
      failedResponseHandler: watsonxErrorHandler,
      successfulResponseHandler: createJsonResponseHandler2(
        watsonxEmbeddingResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    let totalTokens;
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
        body: rawValue ?? response
      },
      warnings: []
    };
  }
};

// src/version.ts
var VERSION = true ? "1.0.4" : "0.0.0-test";

// src/watsonx-provider.ts
function createWatsonx(options = {}) {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? "https://us-south.ml.cloud.ibm.com";
  const getApiKey = () => {
    const apiKey = options.apiKey ?? process.env.WATSONX_AI_APIKEY;
    if (!apiKey) {
      throw new Error(
        "IBM Cloud API key is required. Set WATSONX_AI_APIKEY env variable or pass apiKey option."
      );
    }
    return apiKey;
  };
  const getProjectId = () => {
    const projectId = options.projectId ?? process.env.WATSONX_AI_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        "watsonx.ai project ID is required. Set WATSONX_AI_PROJECT_ID env variable or pass projectId option."
      );
    }
    return projectId;
  };
  const getHeaders = () => withUserAgentSuffix(
    { ...options.headers },
    `ai-sdk/watsonx/${VERSION}`
  );
  const createChatModel = (modelId) => {
    return new WatsonxChatLanguageModel(modelId, {
      provider: "watsonx.chat",
      baseURL,
      apiKey: getApiKey,
      projectId: getProjectId,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId
    });
  };
  const createEmbeddingModel = (modelId, settings = {}) => {
    return new WatsonxEmbeddingModel(modelId, settings, {
      provider: "watsonx.embedding",
      baseURL,
      apiKey: getApiKey,
      projectId: getProjectId,
      headers: getHeaders,
      fetch: options.fetch
    });
  };
  const provider = function(modelId) {
    if (new.target) {
      throw new Error(
        "The watsonx model function cannot be called with the `new` keyword."
      );
    }
    return createChatModel(modelId);
  };
  provider.specificationVersion = "v3";
  provider.chat = createChatModel;
  provider.languageModel = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  return provider;
}
var watsonx = createWatsonx();
export {
  WATSONX_API_VERSION,
  WatsonxChatLanguageModel,
  WatsonxEmbeddingModel,
  createWatsonx,
  createWatsonx as createWatsonxProvider,
  watsonx,
  watsonxLanguageModelOptions
};
//# sourceMappingURL=index.mjs.map