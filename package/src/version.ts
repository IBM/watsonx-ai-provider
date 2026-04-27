// Version of the watsonx-ai-provider package, injected at build time by tsup
// (see tsup.config.ts `define`). Falls back to '0.0.0-test' when running
// straight from source (tests, dev) where the constant isn't substituted.
declare const __PACKAGE_VERSION__: string | undefined;

export const VERSION: string =
  typeof __PACKAGE_VERSION__ !== 'undefined' ? __PACKAGE_VERSION__ : '0.0.0-test';
