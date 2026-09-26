import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { PRODUCT_NAME } from './src/config/product.ts';
import { toothPlugin } from './tools/runner/tooth-plugin.ts';

function readPort(): number {
  const raw = process.env.PORT;
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Set the PORT environment variable to a valid port before starting the dev server (got "${raw ?? ''}").`);
  }
  return port;
}

// index.html carries no product name; it is injected from src/config/product.ts.
function productTitle(): Plugin {
  return {
    name: 'product-title',
    transformIndexHtml: (html) => html.replace('<title></title>', `<title>${PRODUCT_NAME}</title>`),
  };
}

// The folders of the project the dev server does not watch, relative to its root: the root's own reference/, .cache/
// and .playwright-mcp/, never a folder of that name above it (a working copy under .cache/wt is watched whole).
const ROOT = fs.realpathSync(process.cwd());
const UNWATCHED = new Set(['reference', '.cache', '.playwright-mcp']);
const unwatched = (file: string): boolean => UNWATCHED.has(path.relative(ROOT, file).split(path.sep)[0] ?? '');

// A change to a source file reloads the whole page: the editor's store and its React context live in modules a hot
// update would load twice (a context no provider provides: "the editor store is missing"). The page comes back with
// the work autosave kept.
function fullReload(): Plugin {
  return {
    name: 'full-reload',
    handleHotUpdate({ server }) {
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

export default defineConfig(({ command }) => {
  // PORT is required by the servers, dev and preview (vite preview reports the serve command too), never by a build
  const port = command === 'build' ? null : readPort();
  return {
    // toothPlugin() is null unless the scenario runner's tooth proof starts this server (tools/runner/tooth.ts)
    plugins: [react(), productTitle(), toothPlugin(), fullReload()],
    // reference/ holds other projects with their own HTML entries; keep Vite away from them.
    optimizeDeps: { entries: ['index.html'] },
    server: port === null ? {} : { port, strictPort: true, watch: { ignored: unwatched } },
    // the e2e suite serves the build (playwright.config.ts) from `vite preview`, on the same PORT
    preview: port === null ? {} : { port, strictPort: true },
    // the e2e build (E2E_BUILD, set by playwright.config.ts) is not minified: the limited validation reads which
    // functions a test executed from Chrome's coverage of it (tools/impact/analyze.ts), which needs the functions intact
    build: process.env.E2E_BUILD === '1' ? { minify: false, cssMinify: false } : {},
  };
});
