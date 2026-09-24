import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Never collect tests from the reference projects, the Pager copy or the browser tool's scratch files.
    exclude: [...configDefaults.exclude, 'reference/**', '.cache/**', '.playwright-mcp/**'],
    environment: 'node',
  },
});
