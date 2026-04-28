# IBM watsonx.ai Provider for Vercel AI SDK

[![npm version](https://img.shields.io/npm/v/watsonx-ai-provider.svg)](https://www.npmjs.com/package/watsonx-ai-provider)
[![npm downloads](https://img.shields.io/npm/dm/watsonx-ai-provider.svg)](https://www.npmjs.com/package/watsonx-ai-provider)
[![License](https://img.shields.io/npm/l/watsonx-ai-provider.svg)](https://github.com/IBM/watsonx-ai-provider/blob/main/LICENSE)

The **watsonx.ai provider** for the [Vercel AI SDK](https://sdk.vercel.ai/docs) enables integration with IBM watsonx.ai foundation models, including Granite, OpenAI, Meta Llama, Mistral, and other models hosted on watsonx.ai.

## Installation

```bash
npm install watsonx-ai-provider
```

> **Compatibility:** v2.x targets AI SDK v6 and Node.js 20.3+. For AI SDK v4 use the v1.x line.

## Setup

Set the environment variables:

```bash
WATSONX_AI_APIKEY=your-ibm-cloud-api-key
WATSONX_AI_PROJECT_ID=your-watsonx-project-id
```

You can obtain these from:

- **API Key**: [IBM Cloud API Keys](https://cloud.ibm.com/iam/apikeys)
- **Project ID**: Your watsonx.ai project settings

## Quick start

```typescript
import { generateText } from 'ai';
import { watsonx } from 'watsonx-ai-provider';

const { text } = await generateText({
  model: watsonx('openai/gpt-oss-120b'),
  prompt: 'What is machine learning?',
});

console.log(text);
```

The default `watsonx` instance reads `WATSONX_AI_APIKEY` and `WATSONX_AI_PROJECT_ID` from the environment. For custom configuration, use `createWatsonx`:

```typescript
import { createWatsonx } from 'watsonx-ai-provider';

const watsonx = createWatsonx({
  apiKey: process.env.MY_KEY,
  projectId: process.env.MY_PROJECT,
  baseURL: 'https://eu-de.ml.cloud.ibm.com', // optional region
  fetch: customFetch,                        // optional — for testing/proxying
});
```

`createWatsonx` also accepts custom `headers` and a `generateId` function for deterministic test IDs.

## Streaming

```typescript
import { streamText } from 'ai';
import { watsonx } from 'watsonx-ai-provider';

const result = streamText({
  model: watsonx('openai/gpt-oss-120b'),
  prompt: 'Write a short poem about AI.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Tool calling

```typescript
import { generateText, tool } from 'ai';
import { watsonx } from 'watsonx-ai-provider';
import { z } from 'zod';

const result = await generateText({
  model: watsonx('openai/gpt-oss-120b'),
  prompt: 'What is the weather in Tokyo?',
  tools: {
    getWeather: tool({
      description: 'Get the current weather for a location',
      inputSchema: z.object({
        location: z.string().describe('The city name'),
      }),
      execute: async ({ location }) => {
        return `The weather in ${location} is sunny, 22°C.`;
      },
    }),
  },
});

console.log(result.text);
console.log(result.toolCalls);
```

> **Known limitation:** `mistralai/mistral-medium-2505` has a wx.ai-side streaming bug for tool calls — the model generates tokens but they never reach the client. Use `openai/gpt-oss-120b`, `meta-llama/llama-3-3-70b-instruct`, or `ibm/granite-4-h-small` for streaming tool-call workloads. Non-streaming `generateText` with mistral-medium works fine.

## Image input (vision)

Vision-capable models accept https image URLs, data URLs, and `Uint8Array` directly:

```typescript
const { text } = await generateText({
  model: watsonx('meta-llama/llama-3-2-11b-vision-instruct'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image.' },
      { type: 'image', image: 'https://example.com/image.jpg' },
    ],
  }],
});
```

## Text embeddings

```typescript
import { embedMany } from 'ai';
import { watsonx } from 'watsonx-ai-provider';

const { embeddings } = await embedMany({
  model: watsonx.embeddingModel('ibm/granite-embedding-107m-multilingual'),
  values: ['First document', 'Second document'], // up to 100 per call
});
// `embed()` works for single inputs.
```

Available embedding models include `ibm/granite-embedding-107m-multilingual` and `ibm/slate-125m-english-rtrvr-v2`.

## Generation parameters

Standard generation parameters (`temperature`, `topP`, `topK`, `maxOutputTokens`, `stopSequences`) go on the `generateText`/`streamText` call, not the model factory. See [AI SDK call options](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text) for the full list.

## watsonx-specific options

wx.ai-only knobs go through `providerOptions.watsonx`:

```typescript
await generateText({
  model: watsonx('openai/gpt-oss-120b'),
  providerOptions: {
    watsonx: {
      timeLimit: 30000,            // server-side wall-clock cap (ms)
      parallelToolCalls: false,    // disable concurrent tool calls
      reasoningEffort: 'high',     // scales chain-of-thought depth on
                                   // reasoning models. Verified on
                                   // openai/gpt-oss-120b: HIGH produces
                                   // ~3× the reasoning of LOW.
    },
  },
  prompt: '...',
});
```

These are validated via the exported `watsonxLanguageModelOptions` zod schema if you want to pre-validate at your call site.

## JSON / structured output

For structured output, the idiomatic AI SDK API is `generateObject`:

```typescript
import { generateObject } from 'ai';
import { watsonx } from 'watsonx-ai-provider';
import { z } from 'zod';

const { object } = await generateObject({
  model: watsonx('openai/gpt-oss-120b'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
  }),
  prompt: 'Summarize this article...',
});

console.log(object); // typed as inferred from schema
```

This compiles down to a `responseFormat` request on the model. If you need direct control at the lower level, the provider also honors `responseFormat` on `generateText`/`streamText` calls:

```typescript
await generateText({
  model: watsonx('openai/gpt-oss-120b'),
  responseFormat: { type: 'json' },              // free-form JSON
  // or with a schema:
  responseFormat: { type: 'json', schema: yourZodSchema, name: 'Result' },
  prompt: 'Return a JSON object describing ...',
});
```

## Models

Pass any chat model ID available in your watsonx.ai project:

```typescript
watsonx('openai/gpt-oss-120b')
watsonx('meta-llama/llama-3-3-70b-instruct')
watsonx('ibm/granite-4-h-small')
watsonx('mistralai/mistral-small-3-1-24b-instruct-2503')
watsonx('your-org/your-custom-model')
```

For the full live list, see [Supported foundation models](https://www.ibm.com/docs/en/watsonx/saas?topic=solutions-supported-foundation-models). IBM rotates models in and out, so an ID that worked last quarter may now return a "model not found" error — check the linked catalog for current availability.

### Recommendations by workload

Models regularly change in wx.ai but here area a few starting points:
| Workload | Recommended | Why |
|---|---|---|
| General chat | `openai/gpt-oss-120b` | Strong all-rounder; reliable streaming + tool calls. |
| Streaming + tool calls | `openai/gpt-oss-120b`, `meta-llama/llama-3-3-70b-instruct`, `ibm/granite-4-h-small` | All three stream tool-call tokens correctly. Avoid `mistralai/mistral-medium-2505` here (wx.ai-side bug). |
| Reasoning (chain-of-thought) | `openai/gpt-oss-120b` with `providerOptions.watsonx.reasoningEffort: 'high'` | Verified to scale reasoning length ~3× from low to high effort. |
| Coding (general — IDE assistant, debugging, code review) | `openai/gpt-oss-120b` | Best code capability in this catalog combined with reliable tool calling. |
| Coding (cost-sensitive, focused tasks) | `ibm/granite-4-h-small` | Newer Granite family, 32B. Competitive code quality at significantly lower cost than gpt-oss. |
| Structured output / JSON schema | `ibm/granite-4-h-small`, `openai/gpt-oss-120b` | Granite-4 punches above its weight on schema-bounded output and is cheaper. |
| Classification / summarization / extraction | `ibm/granite-4-h-small` | Bounded, focused tasks — ideal granite territory. |
| Small / fast / cheap | `ibm/granite-4-h-small` | 32B params, low latency. Default for cost-sensitive workloads. |
| Long-form prose | `meta-llama/llama-3-3-70b-instruct` | 128K context, strong instruction following. Granite-4 also works but with less nuance. |
| Vision (image input) | `meta-llama/llama-3-2-11b-vision-instruct` | Accepts https image URLs directly. |
| Embeddings | `ibm/granite-embedding-107m-multilingual` | Default embedding model for RAG. |

## Regions

watsonx.ai is available in multiple regions; pass `baseURL` to `createWatsonx`:

| Region | Base URL |
|--------|----------|
| US South (Dallas) | `https://us-south.ml.cloud.ibm.com` (default) |
| EU Germany (Frankfurt) | `https://eu-de.ml.cloud.ibm.com` |
| EU United Kingdom | `https://eu-gb.ml.cloud.ibm.com` |
| Japan (Tokyo) | `https://jp-tok.ml.cloud.ibm.com` |

## Error handling

Errors surface as standard AI SDK `APICallError` instances — check with `APICallError.isInstance(err)` and read `.statusCode`, `.message`, `.isRetryable`. Cached IAM tokens automatically refresh on a `401` response (one-shot retry per call).

## Debug logging

If you suspect a wx.ai-side streaming issue, set `WATSONX_DEBUG_STREAM=1` in the server environment. The provider will log every parsed SSE chunk to the server console — useful for filing IBM support tickets with a reproduction trace.

The provider also surfaces a `console.warn` whenever a stream finishes with `completion_tokens > 0` but no content/tool-calls were emitted (a known wx.ai bug fingerprint). The warning includes the wx.ai `response_id` you can hand to IBM support.

## TypeScript

Full TypeScript support. Public exports:

```typescript
import {
  watsonx,                       // default instance
  createWatsonx,                 // factory for custom config
  watsonxLanguageModelOptions,   // zod schema for providerOptions.watsonx
  type WatsonxProvider,
  type WatsonxProviderSettings,
  type WatsonxChatModelId,
  type WatsonxLanguageModelOptions,
} from 'watsonx-ai-provider';
```

## Upgrading

- **From v1.x**: see [`MIGRATION.md`](https://github.com/IBM/watsonx-ai-provider/blob/main/package/MIGRATION.md) for the v1 → v2 guide.

## Contributing

See [`CONTRIBUTING.md`](https://github.com/IBM/watsonx-ai-provider/blob/main/CONTRIBUTING.md) at the repo root for the changeset / release flow.

## License

Apache-2.0

## Links

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [IBM watsonx.ai Documentation](https://www.ibm.com/products/watsonx-ai)
- [IBM Cloud API Keys](https://cloud.ibm.com/iam/apikeys)
