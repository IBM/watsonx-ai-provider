import {
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamResult,
  type LanguageModelV3StreamPart,
  type LanguageModelV3Content,
  type LanguageModelV3FinishReason,
  type LanguageModelV3Usage,
  type SharedV3Warning,
  APICallError,
} from '@ai-sdk/provider';
import {
  postJsonToApi,
  createJsonResponseHandler,
  createEventSourceResponseHandler,
  generateId as defaultGenerateId,
  parseProviderOptions,
  combineHeaders,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import {
  type WatsonxChatModelId,
  watsonxLanguageModelOptions,
} from './watsonx-chat-settings';
import { type WatsonxConfig, WATSONX_API_VERSION } from './watsonx-config';
import { getIAMToken, invalidateIAMToken } from './watsonx-iam';
import { watsonxChatResponseSchema, watsonxChatChunkSchema } from './watsonx-schemas';
import { z } from 'zod';
import { watsonxErrorHandler } from './watsonx-error';
import { convertToWatsonxMessages } from './watsonx-chat-messages';
import { prepareWatsonxTools } from './watsonx-prepare-tools';
import {
  convertFinishReason,
  convertUsage,
  getResponseMetadata,
  parseToolCallArgs,
} from './watsonx-chat-helpers';

// --- Main Model Class ---

export class WatsonxChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;

  readonly modelId: WatsonxChatModelId;
  private readonly config: WatsonxConfig;

  // Vision-capable wx models accept https image URLs directly; non-vision
  // models will surface an error from the backend when sent one.
  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  constructor(modelId: WatsonxChatModelId, config: WatsonxConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private get generateId(): () => string {
    return this.config.generateId ?? defaultGenerateId;
  }

  private async getArgs(options: LanguageModelV3CallOptions): Promise<{
    body: Record<string, unknown>;
    warnings: SharedV3Warning[];
  }> {
    const warnings: SharedV3Warning[] = [];

    // Check for unsupported features
    if (options.frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }

    if (options.presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }

    if (options.seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const watsonxOptions = await parseProviderOptions({
      provider: 'watsonx',
      providerOptions: options.providerOptions,
      schema: watsonxLanguageModelOptions,
    });

    // Build messages
    const messages = convertToWatsonxMessages(options);

    // Build base request body
    const body: Record<string, unknown> = {
      model_id: this.modelId,
      project_id: this.config.projectId(),
      messages,
      max_tokens: options.maxOutputTokens,
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
      // wx.ai typically caps stop_sequences around 6; warn past a conservative 4.
      const WX_STOP_SEQUENCE_SOFT_CAP = 4;
      if (options.stopSequences.length > WX_STOP_SEQUENCE_SOFT_CAP) {
        warnings.push({
          type: 'other',
          message: `stopSequences has ${options.stopSequences.length} entries; wx.ai may reject more than ${WX_STOP_SEQUENCE_SOFT_CAP} depending on the model family.`,
        });
      }
      body.stop_sequences = options.stopSequences;
    }
    if (watsonxOptions?.timeLimit != null) {
      body.time_limit = watsonxOptions.timeLimit;
    }
    // Reasoning models (e.g. openai/gpt-oss-*) accept the OpenAI-style flat
    // `reasoning_effort` field. Verified to scale reasoning length monotonically
    // (baseline → low → medium → high) on gpt-oss-120b. Quarkus's `thinking`
    // block is silently ignored on wx.ai-hosted models, so we use this shape.
    if (watsonxOptions?.reasoningEffort != null) {
      body.reasoning_effort = watsonxOptions.reasoningEffort;
    }

    // responseFormat: wx.ai supports { type: 'json_object' } and json_schema.
    if (options.responseFormat?.type === 'json') {
      if (options.responseFormat.schema != null) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: options.responseFormat.name ?? 'response',
            description: options.responseFormat.description,
            schema: options.responseFormat.schema,
          },
        };
      } else {
        body.response_format = { type: 'json_object' };
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

  async doGenerate(
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3GenerateResult> {
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
        fetch: this.config.fetch,
      });
    };

    let value: Awaited<ReturnType<typeof call>>['value'];
    let rawValue: Awaited<ReturnType<typeof call>>['rawValue'];
    let responseHeaders: Awaited<ReturnType<typeof call>>['responseHeaders'];
    try {
      ({ value, rawValue, responseHeaders } = await call());
    } catch (error) {
      // One-shot retry on 401 with a fresh IAM token — cached token may have
      // been revoked mid-TTL.
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 401
      ) {
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
        message: 'No choices returned from watsonx.ai',
        url: `${this.config.baseURL}/ml/v1/text/chat?version=${WATSONX_API_VERSION}`,
        requestBodyValues: body,
        isRetryable: false,
      });
    }

    // Build content array
    const content: LanguageModelV3Content[] = [];

    // Reasoning models (e.g. openai/gpt-oss-*) surface chain-of-thought as
    // reasoning_content alongside the final answer. Emit it before text so
    // the SDK delivers it as a `reasoning` content part — same handling as
    // streaming `reasoning-delta` events.
    if (choice.message.reasoning_content) {
      content.push({ type: 'reasoning', text: choice.message.reasoning_content });
    }

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.function.name,
          input: parseToolCallArgs(tc.function.arguments, this.modelId),
        });
      }
    }

    const hasToolCalls = (choice.message.tool_calls?.length ?? 0) > 0;

    return {
      content,
      finishReason: convertFinishReason(choice.finish_reason ?? 'stop', hasToolCalls),
      usage: convertUsage(response.usage),
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawValue ?? response,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3StreamResult> {
    const { body, warnings } = await this.getArgs(options);
    const apiKey = this.config.apiKey();
    const generateId = this.generateId;

    // Stall watchdog: aborts the upstream fetch if no SSE chunk arrives within
    // the window. wx.ai can silently hang on SSE; we need a side-channel kicker.
    // Composed with the caller's signal so the SDK's abort flow sees both.
    const INITIAL_STALL_MS = 120_000; // reasoning models think before streaming
    const STREAMING_STALL_MS = 30_000; // between chunks once content has started
    const stallController = new AbortController();
    const composedSignal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, stallController.signal])
      : stallController.signal;

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
        fetch: this.config.fetch,
      });
    };

    let result: Awaited<ReturnType<typeof call>>;
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

    let usage: LanguageModelV3Usage = {
      inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 0, text: undefined, reasoning: undefined },
    };
    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    const toolCallsInProgress = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    let textId: string | null = null;
    let reasoningId: string | null = null;
    let sentResponseMetadata = false;
    let receivedContent = false;
    let finalized = false;
    let responseId: string | undefined;
    let receivedFinishReason = false;

    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      const ms = receivedContent ? STREAMING_STALL_MS : INITIAL_STALL_MS;
      stallTimer = setTimeout(() => {
        stallController.abort(
          new Error(
            `watsonx stream stalled: no data for ${ms / 1000}s (contentStarted=${receivedContent})`
          )
        );
      }, ms);
    };
    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };

    const finalize = (
      controller: TransformStreamDefaultController<LanguageModelV3StreamPart>
    ) => {
      if (finalized) return;
      finalized = true;
      clearStall();

      if (reasoningId !== null) {
        controller.enqueue({ type: 'reasoning-end', id: reasoningId });
      }
      if (textId !== null) {
        controller.enqueue({ type: 'text-end', id: textId });
      }

      for (const [, tc] of toolCallsInProgress) {
        controller.enqueue({ type: 'tool-input-end', id: tc.id });
        controller.enqueue({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.name,
          input: parseToolCallArgs(tc.args, this.modelId),
        });
      }

      // Override finish reason when tool calls are present — gpt-oss reports
      // 'stop' instead of 'tool_calls' for tool-call responses.
      const finalFinishReason =
        toolCallsInProgress.size > 0 && finishReason.unified !== 'tool-calls'
          ? { unified: 'tool-calls' as const, raw: finishReason.raw }
          : finishReason;

      // Anomaly: wx.ai billed completion tokens but nothing reached the
      // consumer. Known symptom of mistral-medium-2505 streaming tool-calls.
      // Always log so production instances surface it for bug reports.
      const completionTokens = usage.outputTokens?.total ?? 0;
      if (!receivedContent && completionTokens > 0) {
        console.warn(
          `[watsonx] stream anomaly: model=${this.modelId} response_id=${responseId ?? 'unknown'} ` +
            `reported completion_tokens=${completionTokens} but streamed no content/tool_calls. ` +
            `Likely a wx.ai streaming bug. Finish reason received: ${receivedFinishReason}.`
        );
      }

      controller.enqueue({ type: 'finish', finishReason: finalFinishReason, usage });
    };

    const stream = source.pipeThrough(
      new TransformStream<
        ParseResult<z.infer<typeof watsonxChatChunkSchema>>,
        LanguageModelV3StreamPart
      >({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings });
          armStall();
        },

        transform(chunk, controller) {
          if (finalized) return;
          armStall();

          // Opt-in per-chunk trace for bug reports. Set WATSONX_DEBUG_STREAM=1
          // to capture raw + validated chunk shapes to the server console.
          if (process.env.WATSONX_DEBUG_STREAM) {
            if (chunk.success) {
              console.log('[watsonx chunk]', JSON.stringify(chunk.rawValue));
            } else {
              console.log(
                '[watsonx chunk parse-fail]',
                chunk.error,
                'raw:',
                JSON.stringify(chunk.rawValue)
              );
            }
          }

          if (options.includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
          }

          if (!chunk.success) {
            // Schema drift or malformed chunk. Surface as a stream error rather
            // than silently dropping — consumers can decide how to react.
            controller.enqueue({ type: 'error', error: chunk.error });
            return;
          }

          const value = chunk.value;

          if (!sentResponseMetadata) {
            sentResponseMetadata = true;
            const meta = getResponseMetadata(value);
            responseId = meta.id;
            controller.enqueue({
              type: 'response-metadata',
              ...meta,
              timestamp: meta.timestamp ?? new Date(),
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
              controller.enqueue({ type: 'reasoning-start', id: reasoningId });
            }
            controller.enqueue({
              type: 'reasoning-delta',
              id: reasoningId,
              delta: choice.delta.reasoning_content,
            });
          }

          if (choice.delta?.content) {
            receivedContent = true;
            if (textId === null) {
              textId = `text-${generateId()}`;
              controller.enqueue({ type: 'text-start', id: textId });
            }
            controller.enqueue({
              type: 'text-delta',
              id: textId,
              delta: choice.delta.content,
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
                  name: '',
                  args: '',
                };
                toolCallsInProgress.set(toolIndex, existing);
              }
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name && existing.name === '') {
                existing.name = tc.function.name;
                controller.enqueue({
                  type: 'tool-input-start',
                  id: existing.id,
                  toolName: existing.name,
                });
              }
              if (tc.function?.arguments) {
                existing.args += tc.function.arguments;
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: existing.id,
                  delta: tc.function.arguments,
                });
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = convertFinishReason(choice.finish_reason);
            receivedFinishReason = true;
            // Emit cleanup and finish now — some wx models don't close the SSE
            // connection after finish_reason. terminate() closes the readable
            // side cleanly so consumers see done without waiting for timeout.
            finalize(controller);
            controller.terminate();
          }
        },

        flush(controller) {
          finalize(controller);
        },
      })
    );

    return {
      stream,
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}
