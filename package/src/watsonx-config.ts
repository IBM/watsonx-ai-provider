import type { FetchFunction } from '@ai-sdk/provider-utils';

// API version for watsonx.ai endpoints. Matches the value shipped in the
// ibm-watsonx-ai Python SDK (utils/API_VERSION_PARAM); bump when IBM publishes
// a newer release we want to opt into.
export const WATSONX_API_VERSION = '2026-04-20';

export interface WatsonxConfig {
  provider: string;
  baseURL: string;
  apiKey: () => string;
  projectId: () => string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  generateId?: () => string;
}
