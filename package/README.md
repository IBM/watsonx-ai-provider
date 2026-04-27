# IBM watsonx.ai Provider for Vercel AI SDK

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
  baseURL: 'https://eu-de.ml.cloud.ibm.com', // optional region override
  headers: { 'X-Custom-Header': 'value' },   // optional extra headers
  fetch: customFetch,                        // optional fetch override (testing, proxies, telemetry)
  generateId: () => 'fixed-id',              // optional ID generator (deterministic test IDs)
});
```

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

```typescript
import { generateText } from 'ai';
import { watsonx } from 'watsonx-ai-provider';

const { text } = await generateText({
  model: watsonx('meta-llama/llama-3-2-11b-vision-instruct'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'image', image: 'https://example.com/image.jpg' },
      ],
    },
  ],
});
```

Vision-capable models accept https image URLs directly; data URLs and `Uint8Array` are also supported.

## Text embeddings

```typescript
import { embed, embedMany } from 'ai';
import { watsonx } from 'watsonx-ai-provider';

// Single embedding
const { embedding } = await embed({
  model: watsonx.embeddingModel('ibm/granite-embedding-107m-multilingual'),
  value: 'What is machine learning?',
});

// Batch (up to 100 inputs per call)
const { embeddings } = await embedMany({
  model: watsonx.embeddingModel('ibm/granite-embedding-107m-multilingual'),
  values: ['First document', 'Second document', 'Third document'],
});
```

Available embedding models include `ibm/granite-embedding-107m-multilingual` and `ibm/slate-125m-english-rtrvr-v2`.

## Generation parameters

Standard generation parameters go on the call (not the model factory):

```typescript
await generateText({
  model: watsonx('openai/gpt-oss-120b'),
  temperature: 0.7,
  maxOutputTokens: 2048,
  topP: 0.9,
  topK: 50,
  stopSequences: ['\n\n'],
  prompt: '...',
});
```

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

## Recommended models

Different workloads have different sweet spots within the watsonx.ai catalog. As of v2.0.0:

| Workload | Recommended | Why |
|---|---|---|
| General chat | `openai/gpt-oss-120b` | Strong all-rounder; reliable streaming + tool calls. |
| Streaming + tool calls | `openai/gpt-oss-120b`, `meta-llama/llama-3-3-70b-instruct`, `ibm/granite-4-h-small` | All three stream tool-call tokens correctly. Avoid `mistralai/mistral-medium-2505` here (wx.ai-side bug). |
| Reasoning (chain-of-thought) | `openai/gpt-oss-120b` with `providerOptions.watsonx.reasoningEffort: 'high'` | Surfaces reasoning content as a separate stream channel. |
| Coding (general — IDE assistant, debugging, code review) | `openai/gpt-oss-120b` | Best code capability in this catalog combined with reliable tool calling. |
| Coding (cost-sensitive, focused tasks) | `ibm/granite-4-h-small` | Newer Granite family, 32B. Competitive code quality at significantly lower cost than gpt-oss. |
| Coding agents (OpenCode, aider, Claude Code-style) | `openai/gpt-oss-120b` with `providerOptions.watsonx.reasoningEffort: 'high'` | Reliable streaming tool calls + 128K context + reasoning channel. The right choice within wx.ai for multi-step autonomous coding. See note below. |
| Structured output / JSON schema | `ibm/granite-4-h-small`, `openai/gpt-oss-120b` | Granite-4 punches above its weight on schema-bounded output and is cheaper. |
| Classification / summarization / extraction | `ibm/granite-4-h-small` | Bounded, focused tasks — ideal granite territory. |
| Small / fast / cheap | `ibm/granite-4-h-small` | 32B params, low latency. Default for cost-sensitive workloads. |
| Long-form prose | `meta-llama/llama-3-3-70b-instruct` | 128K context, strong instruction following. Granite-4 also works but with less nuance. |
| Vision (image input) | `meta-llama/llama-3-2-11b-vision-instruct` | Accepts https image URLs directly. |
| Embeddings | `ibm/granite-embedding-107m-multilingual` | Default embedding model for RAG. |

These are starting points, not absolutes — actual choice depends on your latency/cost/quality tradeoffs and which models are enabled in your specific watsonx.ai project. The IBM catalog updates frequently; this list reflects what's stable as of the v2.0.0 release date.

> **Frontier coding caveat:** Within wx.ai, `gpt-oss-120b` is the right call for coding agents. **Across all providers**, frontier-tier coding agents (Claude Code with Sonnet/Opus, Cursor with GPT-5/Claude) will still outperform anything on wx.ai for serious agentic coding. Use this provider when you specifically need IBM-hosted inference, watsonx project credits, or compliance/sovereignty constraints — not because it's the absolute best coding backend.

### Using this provider with OpenCode and similar agents

[OpenCode](https://opencode.ai), [aider](https://aider.chat), and most other AI SDK-compatible coding agents accept any provider that implements the AI SDK `LanguageModelV3` interface — which is exactly what this package exports. You can plug `watsonx-ai-provider` into them directly.

Example for OpenCode (in `~/.config/opencode/opencode.json` or your project's `opencode.json`):

```json
{
  "provider": {
    "watsonx": {
      "npm": "watsonx-ai-provider",
      "name": "watsonx.ai",
      "models": {
        "openai/gpt-oss-120b": { "name": "GPT-OSS 120B (watsonx)" },
        "meta-llama/llama-3-3-70b-instruct": { "name": "Llama 3.3 70B (watsonx)" }
      }
    }
  }
}
```

Make sure `WATSONX_AI_APIKEY` and `WATSONX_AI_PROJECT_ID` are set in the environment OpenCode runs in. The provider's default instance picks them up automatically.

For aider and other tools, follow the tool's "custom OpenAI-compatible provider" or "AI SDK provider" docs — the integration shape varies but the underlying contract is the same.

## Available models

The [Recommended models](#recommended-models) table covers the common cases. To use any other chat model from your watsonx.ai project, just pass its ID:

```typescript
watsonx('mistralai/mistral-small-3-1-24b-instruct-2503')
watsonx('meta-llama/llama-3-2-3b-instruct')
watsonx('your-org/your-custom-model')
```

For the full live list of supported model IDs, see [Supported foundation models](https://www.ibm.com/docs/en/watsonx/saas?topic=solutions-supported-foundation-models). IBM rotates models in and out, so an ID that worked last quarter may now return a "model not found" error — check the linked catalog for current availability.

## Regions

watsonx.ai is available in multiple regions; pass `baseURL` to `createWatsonx`:

| Region | Base URL |
|--------|----------|
| US South (Dallas) | `https://us-south.ml.cloud.ibm.com` (default) |
| EU Germany (Frankfurt) | `https://eu-de.ml.cloud.ibm.com` |
| EU United Kingdom | `https://eu-gb.ml.cloud.ibm.com` |
| Japan (Tokyo) | `https://jp-tok.ml.cloud.ibm.com` |

## Error handling

Standard AI SDK error classes:

```typescript
import { generateText } from 'ai';
import { APICallError } from '@ai-sdk/provider';

try {
  const { text } = await generateText({
    model: watsonx('invalid/model'),
    prompt: 'Hello',
  });
} catch (error) {
  if (APICallError.isInstance(error)) {
    console.log('Status:', error.statusCode);
    console.log('Message:', error.message);
    console.log('Retryable:', error.isRetryable);
  }
}
```

Cached IAM tokens automatically refresh on a `401` response (one-shot retry per call).

## Debug logging

If you suspect a wx.ai-side streaming issue, set `WATSONX_DEBUG_STREAM=1` in the server environment. The provider will log every parsed SSE chunk to the server console — useful for filing IBM support tickets with a reproduction trace.

The provider also surfaces a `console.warn` whenever a stream finishes with `completion_tokens > 0` but no content/tool-calls were emitted (a known wx.ai bug fingerprint). The warning includes the wx.ai `response_id` you can hand to IBM support.

## TypeScript

Full TypeScript support is included:

```typescript
import type {
  WatsonxProvider,
  WatsonxProviderSettings,
  WatsonxChatModelId,
  WatsonxLanguageModelOptions,
} from 'watsonx-ai-provider';

import {
  watsonx,                        // default instance
  createWatsonx,                  // factory for custom config
  watsonxLanguageModelOptions,    // zod schema for providerOptions.watsonx
} from 'watsonx-ai-provider';
```

## Migration from v1.x

v2.0.0 includes breaking changes. Most callers only need a couple of mechanical updates.

### Constructor / factory signature

```diff
- const model = watsonx('openai/gpt-oss-120b', { temperature: 0.7, maxTokens: 2048 });
+ const model = watsonx('openai/gpt-oss-120b');
+ // Pass temperature, maxOutputTokens, etc. on the generateText/streamText call:
+ await generateText({ model, temperature: 0.7, maxOutputTokens: 2048, prompt: '...' });
```

The second `settings` argument is removed. Standard generation parameters now flow through `LanguageModelV3CallOptions`. wx.ai-specific knobs (the only one that was unique was `timeLimit`) move to `providerOptions.watsonx`.

### Provider strings

If you check `model.provider` (e.g. for telemetry), note that chat models now report `'watsonx.chat'` and embedding models report `'watsonx.embedding'` (was `'watsonx'` for both).

### Auth simplification

`WATSONX_AI_AUTH_TYPE` is no longer used. v2 only supports IAM authentication.

### Direct REST API

The `@ibm-cloud/watsonx-ai` SDK is no longer a dependency. The provider hits `/ml/v1/text/chat` and `/ml/v1/text/chat_stream` directly via `postJsonToApi`.

### `WatsonxChatSettings` removed

If you imported the `WatsonxChatSettings` type, replace it with `WatsonxLanguageModelOptions`:

```diff
- import type { WatsonxChatSettings } from 'watsonx-ai-provider';
+ import type { WatsonxLanguageModelOptions } from 'watsonx-ai-provider';
```

The fields are different — see "watsonx-specific options" above.

### `zod` v4 required

Peer dependency tightened from `^3.25.0 || ^4.0.0` to `^4.0.0`. The provider uses `.loose()` which is zod v4-only. If you're on zod v3, upgrade before installing v2.

### `createWatsonxProvider` alias

Still works as an alias for `createWatsonx`, but is now marked `@deprecated`. Update imports to silence editor warnings:

```diff
- import { createWatsonxProvider } from 'watsonx-ai-provider';
+ import { createWatsonx } from 'watsonx-ai-provider';
```

## Contributing

Releases are managed by [Changesets](https://github.com/changesets/changesets). When you open a PR, decide whether your change should produce a new published version of the package. The rule of thumb: **does this change anything a consumer of `watsonx-ai-provider` would observe at runtime, type-time, or peer-dep time?**

### Add a changeset

If yes — run from the `package/` directory:

```bash
npm run changeset
```

The CLI asks for a bump type and a one-line summary. Commit the resulting `.changeset/<random-name>.md` alongside your code change. Bump-type guide:

| Bump | When to pick |
|---|---|
| **`patch`** | Bug fix, internal correctness, no API or behavior shift visible to typical callers |
| **`minor`** | New feature, new option, new export — backwards-compatible |
| **`major`** | Removed/renamed export, changed function signature, raised peer-dep range, changed runtime behavior in a way that could break callers |

When the PR merges to `main`, the Release workflow opens (or updates) a "Version Packages" PR aggregating all pending changesets. Merging that PR publishes to npm and creates the GitHub Release.

### Skip the changeset

If your change has **zero impact on the published package**, no changeset is needed. Common cases:

- Documentation-only edits (README, PUBLISHING, repo-root markdown)
- CI / GitHub Actions tweaks (`.github/workflows/`)
- Test-only changes (no production code touched)
- `examples/` updates (not part of the published package — `files` in `package.json` only ships `dist/` + README + LICENSE)
- Repo tooling (`.gitignore`, `.editorconfig`, etc.)
- Internal refactors with byte-identical compiled output (e.g. renaming a private variable or extracting a helper used in one place)
- Comment / typo fixes inside source files

If a reviewer questions whether a changeset is needed, the safe answer is to add a `patch` changeset describing the user-visible effect (or "internal change, no user impact" if there isn't one). You can also create an explicit empty changeset to record the intent:

```bash
npm run changeset -- --empty
```

This produces a `.changeset/*.md` with no version bump but a recorded summary — useful if a reviewer wants to see the change deliberately marked as no-release.

### Avoiding accidental releases

The Release workflow only fires when `.changeset/*.md` files (other than `README.md`) exist on `main`. To save in-progress changeset content without triggering it, use a non-`.md` extension like `<name>.md.draft` — Changesets ignores anything that doesn't end in `.md`.

## License

Apache-2.0

## Links

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [IBM watsonx.ai Documentation](https://www.ibm.com/products/watsonx-ai)
- [IBM Cloud API Keys](https://cloud.ibm.com/iam/apikeys)
