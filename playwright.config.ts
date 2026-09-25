import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The e2e run builds the app once and serves the build on this port (a static `vite preview`, much faster per
// test than the dev server); it never talks to a stale or foreign server.
const port = process.env.E2E_PORT ?? '5310';
const baseURL = `http://localhost:${port}`;

// A folder of this project, matched on the absolute path from the project's own root: a pattern such as
// '**/.cache/**' would also ignore every test when the project itself sits under a .cache folder (a worktree in
// .cache/wt/).
const root = path.dirname(fileURLToPath(import.meta.url));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const under = (dir: string) => new RegExp(`^${[...root.split(/[\\/]/), dir].map(escape).join('[\\\\/]')}[\\\\/]`, 'i');

// E2E_WORKERS must be a whole number of at least 1; a typo fails the run instead of silently using every core.
function workerCount(value: string | undefined): number {
  if (value === undefined || value === '') return 4;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) throw new Error(`E2E_WORKERS must be a whole number >= 1, got "${value}"`);
  return count;
}

export default defineConfig({
  testDir: 'tests/e2e',
  // Never discover tests in the reference projects, the Pager copy or the browser tool's scratch files.
  testIgnore: [under('reference'), under('.cache'), under('.playwright-mcp')],
  fullyParallel: true,
  // the number of browsers per run comes from E2E_WORKERS, 4 when unset: the default (half the cores, 12 here)
  // froze the machine; the test Chrome already draws on the GPU (ANGLE D3D11), the load was the number of browsers
  workers: workerCount(process.env.E2E_WORKERS),
  forbidOnly: !!process.env.CI,
  retries: 0,
  // the list of results, then each feature's status derived from its scenario tests (tools/runner/status.ts)
  reporter: [['list'], ['./tools/runner/status.ts']],
  // a failure shows in seconds: every action and every expect waits at most 5 s, a navigation 15 s
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    channel: 'chrome',
    // no trace while testing: 'retain-on-failure' records every test (screencast and DOM snapshots) to keep the
    // failures, and cost 38% of the suite's CPU (docs/testing/README.md, "Causes"); a failure is diagnosed by running
    // the failed tests again with their trace: npm run e2e:diagnose
    trace: 'off',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    // the app under test is the build, served statically (the same tests, no per-module dev transforms per request);
    // tests/support/proofs.ts is built beside it for the browser-side proofs
    command: 'npm run build && npm run build:proofs && npm run preview',
    url: baseURL,
    // the tooth proof (tools/runner/tooth.ts) switches a feature off in the build it makes here (tooth-plugin.ts)
    env: { PORT: port, TOOTH_COMMANDS: process.env.TOOTH_COMMANDS ?? '', TOOTH_MODULE: process.env.TOOTH_MODULE ?? '' },
    reuseExistingServer: false,
    // the build runs first: a cold one takes about a minute
    timeout: 240_000,
  },
});
