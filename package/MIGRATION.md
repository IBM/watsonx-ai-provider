# Migration guide

## v1.x → v2.0.0

v2.0.0 is a major rewrite. Most callers only need a couple of mechanical updates.

### Constructor / factory signature

```diff
- const model = watsonx('openai/gpt-oss-120b', { temperature: 0.7, maxTokens: 2048 });
+ const model = watsonx('openai/gpt-oss-120b');
+ // Pass temperature, maxOutputTokens, etc. on the generateText/streamText call:
+ await generateText({ model, temperature: 0.7, maxOutputTokens: 2048, prompt: '...' });
```

The second `settings` argument is removed. Standard generation parameters now flow through `LanguageModelV3CallOptions`. wx.ai-specific knobs (the only one that was unique was `timeLimit`) move to `providerOptions.watsonx`. See the [README's "watsonx-specific options" section](https://github.com/IBM/watsonx-ai-provider/blob/main/package/README.md#watsonx-specific-options) for the full set.

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

The fields are different — see [README "watsonx-specific options"](https://github.com/IBM/watsonx-ai-provider/blob/main/package/README.md#watsonx-specific-options).

### `zod` v4 required

Peer dependency tightened from `^3.25.0 || ^4.0.0` to `^4.0.0`. The provider uses `.loose()` which is zod v4-only. If you're on zod v3, upgrade before installing v2.

### `createWatsonxProvider` alias

Still works as an alias for `createWatsonx`, but is now marked `@deprecated`. Update imports to silence editor warnings:

```diff
- import { createWatsonxProvider } from 'watsonx-ai-provider';
+ import { createWatsonx } from 'watsonx-ai-provider';
```

### Node.js requirement

Engines bumped from `>=18` to `>=20.3.0`. v2 uses `AbortSignal.any` (Node 20.3+) for the stall watchdog.
