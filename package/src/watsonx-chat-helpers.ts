import type {
  LanguageModelV3FinishReason,
  LanguageModelV3ResponseMetadata,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';

/**
 * Extracts response metadata (id, modelId, timestamp) from a watsonx.ai chat
 * response or stream chunk. Both shapes include `id`, `model_id`, and `created`
 * (unix seconds). Missing fields surface as `undefined`.
 */
export function getResponseMetadata(value: {
  id?: string | null;
  model_id?: string | null;
  created?: number | null;
}): LanguageModelV3ResponseMetadata {
  return {
    id: value.id ?? undefined,
    modelId: value.model_id ?? undefined,
    timestamp:
      typeof value.created === 'number'
        ? new Date(value.created * 1000)
        : undefined,
  };
}

export function convertFinishReason(
  reason: string,
  hasToolCalls = false
): LanguageModelV3FinishReason {
  let unified: LanguageModelV3FinishReason['unified'];
  switch (reason) {
    case 'stop':
    case 'eos_token':
      unified = 'stop';
      break;
    case 'length':
    case 'max_tokens':
      unified = 'length';
      break;
    case 'tool_calls':
      unified = 'tool-calls';
      break;
    case 'content_filter':
      unified = 'content-filter';
      break;
    default:
      unified = 'other';
  }
  // Infer tool-calls if tools are present but reason is unclear
  if (unified === 'other' && hasToolCalls) {
    unified = 'tool-calls';
  }
  return { unified, raw: reason };
}

// Granite models occasionally return tool-call arguments as a JSON-encoded
// string wrapping the real JSON (e.g. "\"{\\\"foo\\\": 1}\""). Unwrap once,
// only for IBM Granite models — other providers can legitimately return a
// JSON-encoded string that we shouldn't mutate.
//
// Despite the name, this does not fully parse the arguments — the SDK expects
// a string/JSON value that it parses itself.
export function parseToolCallArgs(args: string, modelId?: string): string {
  if (modelId == null || !modelId.startsWith('ibm/granite')) {
    return args;
  }
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === 'string') {
      return parsed;
    }
  } catch {
    // Not valid JSON, keep original
  }
  return args;
}

export function convertUsage(
  usage:
    | {
        prompt_tokens: number;
        completion_tokens: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      }
    | null
    | undefined
): LanguageModelV3Usage {
  if (usage == null) {
    return {
      inputTokens: {
        total: 0,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 0, text: undefined, reasoning: undefined },
    };
  }

  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  const textTokens =
    reasoningTokens != null
      ? Math.max(0, usage.completion_tokens - reasoningTokens)
      : usage.completion_tokens;

  return {
    inputTokens: {
      total: usage.prompt_tokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.completion_tokens,
      text: textTokens,
      reasoning: reasoningTokens,
    },
    raw: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    },
  };
}
