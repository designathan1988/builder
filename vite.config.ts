import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { PRODUCT_NAME } from './src/config/product.ts';

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

export default defineConfig(({ command }) => ({
  plugins: [react(), productTitle()],
  // reference/ holds other projects with their own HTML entries; keep Vite away from them.
  optimizeDeps: { entries: ['index.html'] },
  server:
    command === 'serve'
      ? { port: readPort(), strictPort: true, watch: { ignored: ['**/reference/**'] } }
      : {},
}));
