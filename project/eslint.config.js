import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    // Apply to all TypeScript files in the project so staged files outside
    // src/ (examples, mcp-server, vitest config) don't produce
    // "no matching configuration" warnings under --max-warnings 0.
    files: ['**/*.ts'],
    ignores: ['**/dist/**', '**/node_modules/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // `any` permitted in MCP query results (documented exception in CLAUDE.md).
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused-var enforcement deferred to tsc strict mode (v0.2.0 cleanup).
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
];
