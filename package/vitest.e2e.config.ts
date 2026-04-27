import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load environment variables from .env.e2e
config({ path: '.env.e2e' });

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 60000,
  },
});
