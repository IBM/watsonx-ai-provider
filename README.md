# IBM watsonx.ai Provider for Vercel AI SDK

[![npm version](https://img.shields.io/npm/v/watsonx-ai-provider.svg)](https://www.npmjs.com/package/watsonx-ai-provider)
[![npm downloads](https://img.shields.io/npm/dm/watsonx-ai-provider.svg)](https://www.npmjs.com/package/watsonx-ai-provider)
[![License](https://img.shields.io/npm/l/watsonx-ai-provider.svg)](./LICENSE)

`watsonx-ai-provider` is an [npm package](https://www.npmjs.com/package/watsonx-ai-provider) that provides [watsonx.ai](https://www.ibm.com/products/watsonx-ai) language model support for Vercel's [AI SDK](https://sdk.vercel.ai/).  

AI SDK is a framework for building AI-powered applications quickly. It can be used to create custom chat apps, as well as agents and AI integrations. It has ui hooks for managing front end state as well as abstractions for working with AI models. Our library has model support for streaming, tool calling, image input, and text embeddings.

It also allows you to use watsonx.ai models in other applications that integrate with AI SDK such as [Opencode](./OPENCODE.md).

## Contents

- **[`package/`](./package)** — the npm package. See [`package/README.md`](./package/README.md) for installation and usage.
- **[`examples/cli`](./examples/cli)** — CLI chatbot example
- **[`examples/nextjs`](./examples/nextjs)** — Next.js chatbot example

## Documentation

- [**Package README**](./package/README.md) — full usage docs (installation, examples, providerOptions, models, error handling)
- [**Migration guide**](./package/MIGRATION.md) — v1 → v2 upgrade notes
- [**Contributing**](./CONTRIBUTING.md) — changeset workflow, release pipeline, and Trusted Publishing setup

## License

[Apache-2.0](./LICENSE)
