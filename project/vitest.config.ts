import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['../tests/setup.ts'],
    include: ['../tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',          // build output (incl. mcp-server/**/dist) — measure src, not compiled copies
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/',
        '**/*.d.ts',
        '**/examples/**',      // sample/demo code, not shipped app logic
        '**/*.config.{js,ts,mjs,cjs}',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    conditions: ['node', 'import', 'module', 'default'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, '../tests'),
      // Alias these CJS packages to their real entry paths so vite sets the
      // correct __filename, enabling internal relative CJS requires to resolve.
      'yaml': resolve(__dirname, './node_modules/yaml/dist/index.js'),
      'better-sqlite3': resolve(__dirname, './node_modules/better-sqlite3/lib/index.js'),
    },
  },
});
