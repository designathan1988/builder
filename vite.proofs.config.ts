// The e2e suite's test-support bundle: tests/support/proofs.ts, built into the same dist/ as the app so the static
// preview (`vite preview`) serves it at /proofs.js beside it. Only the loadable module list is built here; the app's
// own entry and chunks are the ones `vite build` made (vite.config.ts).
import { defineConfig } from 'vite';
import { toothPlugin } from './tools/runner/tooth-plugin.ts';

export default defineConfig({
  // the tooth proof (tools/runner/tooth.ts) switches a feature off in everything this run serves, this bundle included
  plugins: [toothPlugin()],
  build: {
    outDir: 'dist',
    // the app's build is already there
    emptyOutDir: false,
    minify: false,
    lib: { entry: 'tests/support/proofs.ts', formats: ['es'], fileName: () => 'proofs.js' },
  },
});
