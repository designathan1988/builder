import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import builder from './tools/lint/plugin.ts';

export default defineConfig(
  // .cache holds the running Pager copy and .playwright-mcp the browser tool's scratch files; neither is project code.
  globalIgnores(['dist', 'reference', '.cache', '.playwright-mcp', 'node_modules', 'test-results', 'playwright-report']),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['*.config.{js,ts}', '.dependency-cruiser.cjs', 'tests/**/*.ts', 'tools/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The time is read only through the Clock port and ids come only from the IdGenerator port (ARCHITECTURE.md).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/ports/clock.ts', 'src/core/ports/ids.ts'],
    plugins: { builder },
    rules: { 'builder/use-ports': 'error' },
  },
  {
    // The document core stays plain TypeScript so it can run and be tested without React.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/core is plain TypeScript and must not import React.',
            },
          ],
        },
      ],
    },
  },
);
