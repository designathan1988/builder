import { defineConfig } from '@playwright/test';

// The e2e run starts its own dev server on this port so it never talks to a stale or foreign server.
const port = process.env.E2E_PORT ?? '5310';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  // Never discover tests in the reference projects, the Pager copy or the browser tool's scratch files.
  testIgnore: ['**/reference/**', '**/.cache/**', '**/.playwright-mcp/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    env: { PORT: port },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
