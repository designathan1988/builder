// npm run check: the limited validation of the change in the working tree (docs/testing/README.md).
//
// It validates what the change can affect and nothing else, and says why each browser test runs:
// - the static checks on what changed: the type check (incremental), lint of the changed files (cached), the unit
//   tests related to the changed files (vitest related), manifest:check and gen:check when their inputs changed;
// - the browser tests the dependency map cannot vouch for (tools/impact/impact.ts decide): the rest keep their last
//   result. A failure the change cannot affect stays listed as open, and does not fail this check: it fails the whole
//   suite (npm run e2e), the checkpoint before a commit reaches main.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { decide, environmentHash, environmentParts, git, listTests, readBuild, readMap, scenarioPrint, snapshotTree, writeMap, type Decision } from './impact.ts';

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
const run = (command: string, env: NodeJS.ProcessEnv = {}) => spawnSync(command, { shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024 });
const title = (id: string) => (JSON.parse(id) as string[]).join(' › ');

// 1. the build the tests will run against, and what it is made of
const build = run('npm run build && npm run build:proofs', { E2E_BUILD: '1' });
if (build.status !== 0) {
  process.stdout.write(build.stdout + build.stderr);
  console.log('check: the e2e build failed');
  process.exit(1);
}
const app = readBuild();
const browser = await chromium.launch({ channel: 'chrome' });
const parts = environmentParts(browser.version());
await browser.close();
const environment = environmentHash(parts);
const map = readMap();
const snapshot = snapshotTree();
let snapshotKnown = map !== null;
if (map !== null && spawnSync('git', ['cat-file', '-e', `${map.snapshot}^{commit}`]).status !== 0) snapshotKnown = false;
const changed = snapshotKnown && map ? git(['diff', '--name-only', map.snapshot, snapshot]).split('\n').filter((f) => f !== '') : [];

// 2. the static checks, limited to what changed
const code = changed.filter((f) => /\.(ts|tsx|js|mjs|css)$/.test(f) && fs.existsSync(f));
const statics: { name: string; command: string }[] = [
  { name: 'typecheck', command: 'npx tsc -p tsconfig.app.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo-app && npx tsc -p tsconfig.node.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo-node' },
];
if (!snapshotKnown) statics.push({ name: 'lint', command: 'npx eslint . --max-warnings 0 --cache --cache-location .cache/eslintcache' }, { name: 'unit', command: 'npx vitest run' });
else {
  if (code.length > 0) statics.push({ name: 'lint', command: `npx eslint --max-warnings 0 --cache --cache-location .cache/eslintcache ${code.join(' ')}` });
  const unitInputs = code.filter((f) => f.startsWith('src/') || f.startsWith('tools/'));
  if (changed.some((f) => f === 'vitest.config.ts' || f === 'package-lock.json')) statics.push({ name: 'unit', command: 'npx vitest run' });
  else if (unitInputs.length > 0) statics.push({ name: 'unit', command: `npx vitest related --run --passWithNoTests ${unitInputs.join(' ')}` });
}
if (!snapshotKnown || changed.some((f) => /^(manifest\/|src\/manifest\/|tools\/manifest\/|spec\/)/.test(f))) statics.push({ name: 'manifest:check', command: 'npm run manifest:check' });
if (!snapshotKnown || changed.some((f) => /^(manifest\/|tools\/gen\/|design\/|src\/generated\/|src\/ui\/)/.test(f))) statics.push({ name: 'gen:check', command: 'npm run gen:check' });
const staticRuns = Promise.all(
  statics.map(
    (s) =>
      new Promise<{ name: string; code: number; output: string }>((resolve) => {
        const child = spawn(s.command, { shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
        let output = '';
        child.stdout.on('data', (c: Buffer) => (output += c.toString()));
        child.stderr.on('data', (c: Buffer) => (output += c.toString()));
        child.on('close', (c) => resolve({ name: s.name, code: c ?? 1, output }));
      }),
  ),
);

// 3. the browser tests the change can affect
const tests = listTests();
const testSide = snapshotKnown && map ? new Set(listTests(map.snapshot)) : new Set<string>();
const unmappedFiles = new Set(
  fs
    .readdirSync('tests/e2e')
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => {
      const text = fs.readFileSync(path.join('tests/e2e', f), 'utf8');
      return /\bnew(Context|Page)\(/.test(text) && !text.includes('impact.track(');
    }),
);
const decision: Decision =
  map !== null && !snapshotKnown
    ? { selected: new Map(tests.map((t) => [t, "the map's snapshot commit is gone"])), valid: [], openFailures: [], broad: "the map's snapshot commit is gone" }
    : decide({ map, environment, environmentParts: parts, changedFiles: changed, testSide, tests, build: app, scenarioOf: scenarioPrint, unmappedFiles });

console.log(`check: ${changed.length} files changed since the last validated tree${changed.length > 0 ? `: ${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', ...' : ''}` : ''}`);
if (decision.broad) console.log(`check: every browser test runs: ${decision.broad}`);
else {
  const byReason = new Map<string, number>();
  for (const reason of decision.selected.values()) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  for (const [reason, n] of byReason) console.log(`check:   ${n} test(s): ${reason}`);
}
console.log(`check: selected ${decision.selected.size} of ${tests.length} browser tests; ${decision.valid.length} keep their last pass (nothing they depend on changed)`);
for (const f of decision.openFailures) console.log(`check: OPEN FAILURE (not affected by this change, still failing): ${title(f.id)}${f.error ? ` - ${f.error}` : ''}`);

if (process.argv.includes('--dry-run')) {
  // what would run and why, without running it
  for (const [id, reason] of decision.selected) console.log(`check:   would run ${title(id)} (${reason})`);
  await staticRuns;
  process.exit(0);
}
const staticResults = await staticRuns;
for (const r of staticResults) {
  if (r.code !== 0) process.stdout.write(r.output);
  console.log(`check: ${r.name} exit ${r.code}`);
}

// 4. run them; the teardown records them in the map and moves its snapshot here
let browserCode = 0;
if (decision.selected.size > 0) {
  const selectionFile = path.join('.cache', 'impact', `selection-${process.pid}.json`);
  fs.mkdirSync(path.dirname(selectionFile), { recursive: true });
  fs.writeFileSync(selectionFile, JSON.stringify([...decision.selected.keys()]));
  browserCode = await new Promise<number>((resolve) => {
    const child = spawn('npx playwright test', {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, E2E_SELECTION: selectionFile, E2E_PREBUILT: '1', E2E_CHECK: '1', E2E_SNAPSHOT: snapshot, E2E_RUN_ID: `check-${process.pid}` },
    });
    child.on('close', (c) => resolve(c ?? 1));
  });
  fs.rmSync(selectionFile, { force: true });
} else if (map !== null) {
  // nothing to run: every test keeps its result, and the validated tree is this one
  writeMap({ ...map, snapshot });
}
const failedStatics = staticResults.filter((r) => r.code !== 0).map((r) => r.name);
const ok = failedStatics.length === 0 && browserCode === 0;
console.log(`check: ${ok ? 'PASSED' : 'FAILED'} in ${elapsed()}${failedStatics.length > 0 ? ` (static: ${failedStatics.join(', ')})` : ''}${browserCode !== 0 ? ' (browser tests)' : ''}${decision.openFailures.length > 0 ? `; ${decision.openFailures.length} open failure(s) the change does not affect, listed above` : ''}`);
process.exit(ok ? 0 : 1);
