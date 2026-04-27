# Contributing to watsonx-ai-provider

Thank you for your interest in contributing to the watsonx.ai provider for the Vercel AI SDK!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/IBM/watsonx-ai-provider.git
   cd watsonx-ai-provider/package
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Build:
   ```bash
   npm run build
   ```

## Project Structure

```
package/
├── src/
│   ├── index.ts                    # Main exports
│   ├── watsonx-provider.ts         # Provider factory
│   ├── watsonx-chat-language-model.ts  # Chat model implementation
│   ├── watsonx-chat-settings.ts    # Chat settings types
│   ├── watsonx-chat-messages.ts    # Message conversion
│   ├── watsonx-chat-helpers.ts     # Utility functions
│   ├── watsonx-embedding-model.ts  # Embedding model implementation
│   ├── watsonx-embedding-settings.ts  # Embedding settings types
│   ├── watsonx-config.ts           # Configuration types
│   ├── watsonx-iam.ts              # IAM token management
│   ├── watsonx-error.ts            # Error handling
│   ├── watsonx-schemas.ts          # Zod schemas
│   ├── test-utils.ts               # Test utilities
│   └── *.test.ts                   # Unit tests
├── tsup.config.ts                  # Build configuration
├── vitest.config.ts                # Test configuration
└── package.json
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add tests for new features
- Update documentation as needed

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checks
5. Submit a pull request

## Reporting Issues

Please use [GitHub Issues](https://github.com/IBM/watsonx-ai-provider/issues) to report bugs or request features.

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
