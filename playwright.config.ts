import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The e2e run starts its own dev server on this port so it never talks to a stale or foreign server.
const port = process.env.E2E_PORT ?? '5310';
const baseURL = `http://localhost:${port}`;

// A folder of this project, matched on the absolute path from the project's own root: a pattern such as
// '**/.cache/**' would also ignore every test when the project itself sits under a .cache folder (a worktree in
// .cache/wt/).
const root = path.dirname(fileURLToPath(import.meta.url));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const under = (dir: string) => new RegExp(`^${[...root.split(/[\\/]/), dir].map(escape).join('[\\\\/]')}[\\\\/]`, 'i');

export default defineConfig({
  testDir: 'tests/e2e',
  // Never discover tests in the reference projects, the Pager copy or the browser tool's scratch files.
  testIgnore: [under('reference'), under('.cache'), under('.playwright-mcp')],
  fullyParallel: true,
  // at most 3 browsers per run: the default (half the cores, 12 here) with helpers running in parallel froze the
  // machine; the test Chrome already draws on the GPU (ANGLE D3D11), the load was the number of browsers
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // the list of results, then each feature's status derived from its scenario tests (tools/runner/status.ts)
  reporter: [['list'], ['./tools/runner/status.ts']],
  // a failure shows in seconds: every action and every expect waits at most 5 s, a navigation 15 s
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // the tooth proof (tools/runner/tooth.ts) switches a feature off in the server it starts
    env: { PORT: port, TOOTH_COMMANDS: process.env.TOOTH_COMMANDS ?? '', TOOTH_MODULE: process.env.TOOTH_MODULE ?? '' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
