import css from '@eslint/css';
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import builder, { builderCss } from './tools/lint/plugin.ts';

// The generated tokens (ARCHITECTURE.md, Tokens): the one stylesheet that writes colours, spacing, sizes, radii,
// shadows and font values.
const TOKENS = 'src/ui/tokens.css';

export default defineConfig(
  // .cache holds the running Pager copy, .playwright-mcp the browser tool's scratch files and .claude the agents'
  // worktrees; none is project code.
  globalIgnores(['dist', 'reference', '.cache', '.playwright-mcp', '.claude', 'node_modules', 'test-results', 'playwright-report']),
  {
    // The JavaScript and TypeScript rules. Stylesheets are linted by their own language below.
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strict],
  },
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
    // UI text comes only from t() and the i18n catalogues, and style objects take their values from the tokens.
    files: ['src/**/*.tsx'],
    plugins: { builder },
    rules: {
      'builder/no-literal-ui-string': 'error',
      'builder/use-tokens': ['error', { tokens: TOKENS }],
    },
  },
  {
    // Every stylesheet but the generated tokens reads its colours, spacing, sizes, radii, shadows and font values
    // from the tokens.
    files: ['src/**/*.css'],
    ignores: [TOKENS],
    language: 'css/css',
    plugins: { css, 'builder-css': builderCss },
    rules: { 'builder-css/use-tokens': ['error', { tokens: TOKENS }] },
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
