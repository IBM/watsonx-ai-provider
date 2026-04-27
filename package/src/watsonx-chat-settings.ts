import { z } from 'zod';

export type WatsonxChatModelId =
  // OpenAI
  | 'openai/gpt-oss-120b'
  // IBM Granite models
  | 'ibm/granite-4-h-small'
  | 'ibm/granite-8b-code-instruct'
  // Meta Llama models
  | 'meta-llama/llama-3-3-70b-instruct'
  | 'meta-llama/llama-3-2-11b-vision-instruct'
  | 'meta-llama/llama-3-2-3b-instruct'
  | 'meta-llama/llama-3-2-1b-instruct'
  // Mistral models
  // Note: mistral-medium-2505 has a known wx.ai streaming bug where tool-call
  // tokens are billed but never transmitted in SSE deltas. Route mistral
  // tool-calling workloads through doGenerate (non-streaming) or pick a
  // different family until IBM fixes it.
  | 'mistralai/mistral-medium-2505'
  | 'mistralai/mistral-small-3-1-24b-instruct-2503'
  | 'mistralai/pixtral-12b'
  // Allow any model ID
  | (string & {});

/**
 * watsonx.ai-specific options passed via `providerOptions.watsonx` on a call.
 * Standard generation parameters (temperature, topP, topK, maxOutputTokens,
 * stopSequences) live on LanguageModelV3CallOptions and should be passed there.
 */
export const watsonxLanguageModelOptions = z.object({
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
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
});

export type WatsonxLanguageModelOptions = z.infer<
  typeof watsonxLanguageModelOptions
>;
