import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      JWT_SECRET: 'test-secret-for-vitest-only-must-be-32-chars!!',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db/index.ts', 'src/server.ts'],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 30,
      },
    },
  },
});
