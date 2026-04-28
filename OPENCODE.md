# Using watsonx-ai-provider (Vercel AI SDK) with opencode

[opencode](https://opencode.ai/) is a terminal-based AI coding agent that consumes Vercel AI SDK providers via npm. This guide sets up `watsonx-ai-provider` as a custom provider in opencode so you can pick watsonx.ai models from the model picker.

## Prerequisites

- [opencode](https://opencode.ai/docs/) installed
- An IBM Cloud account with a watsonx.ai project
- Your **API key** from [IBM Cloud API Keys](https://cloud.ibm.com/iam/apikeys)
- Your **project ID** from your watsonx.ai project settings

## 1. Add the provider block with your project ID, and models

Edit `~/.config/opencode/opencode.json` and add a `watsonx` provider:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "watsonx": {
      "npm": "watsonx-ai-provider",
      "name": "watsonx.ai",
      "options": {
        "projectId": "your-watsonx-project-id"
      },
      "models": {
        "openai/gpt-oss-120b": { "name": "GPT-OSS 120B (watsonx)" },
        "meta-llama/llama-3-3-70b-instruct": { "name": "Llama 3.3 70B (watsonx)" },
        "ibm/granite-4-h-small": { "name": "Granite 4 H Small (watsonx)" }
      }
    }
  }
}
```

The provider key (`"watsonx"`) is the identifier the next step references. `models` is a manual list — opencode doesn't auto-discover watsonx model IDs. The left side is the watsonx model ID sent to the API; the `name` is the label in the picker. See [Models](./package/README.md#models) for the full list of supported IDs.

## 2. Store the API key

Run opencode's auth flow:

```sh
opencode auth login
```

Pick **Other**, then enter:

- **Provider id:** `watsonx` (must match the provider key from step 1)
- **API key:** your IBM Cloud API key

This writes to `~/.local/share/opencode/auth.json` (mode 0600). Verify with:

```sh
opencode auth list
```

## 3. Verify

Launch opencode and run:

```
/models
```

You should see your watsonx models in the picker. Select one and send a message to confirm the credentials work. GPT-OSS 120B is suggested.

## Project ID handling

The `projectId` field is an account-scoped identifier — not a credential, but it does identify which IBM Cloud account you're using. Three options depending on whether you commit `opencode.json` to a dotfiles repo:

**Hardcode** (simplest, fine if you don't commit/share the file):
```json
"options": { "projectId": "abc123-..." }
```

**Read from a file** (keeps it out of a committed config):
```json
"options": { "projectId": "{file:~/.local/share/opencode/watsonx-project}" }
```

**Read from an env var**:
```json
"options": { "projectId": "{env:WATSONX_AI_PROJECT_ID}" }
```
…then `export WATSONX_AI_PROJECT_ID=...` in your shell rc.

## Other regions

If your watsonx.ai project lives outside the default `us-south` region, add `baseURL` to `options`:

```json
"options": {
  "projectId": "...",
  "baseURL": "https://eu-de.ml.cloud.ibm.com"
}
```

See [Regions](./package/README.md#regions) for the full list.

## Adding more models

To expose another watsonx model in the picker, add an entry under `models` in `opencode.json`:

```json
"models": {
  "ibm/granite-4-h-small": { "name": "Granite 4 H Small (watsonx)" }
}
```

The key is the watsonx model ID. The `name` can be anything.

## Troubleshooting

**`401 Unauthorized`** — the stored API key is wrong or expired. Re-run `opencode auth login` and pick `watsonx` to overwrite it.

**`Model not found`** — IBM rotates models in and out of the catalog. Confirm the model ID is currently available in your project at [Supported foundation models](https://www.ibm.com/docs/en/watsonx/saas?topic=solutions-supported-foundation-models).

**Provider doesn't appear in `/models`** — check that the provider key in `opencode.json` and the provider id in auth.json are identical strings.
