import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  define: {
    // Replaces the `__PACKAGE_VERSION__` symbol declared in src/version.ts
    // with the literal string from package.json at build time.
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
