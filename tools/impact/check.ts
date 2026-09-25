// npm run check: the limited validation of the change in the working tree (docs/testing/README.md).
//
// It validates what the change can affect and nothing else, and says why each browser test runs:
// - the static checks on what changed since they last ran (tools/impact/statics.ts): the type check (incremental,
//   whole program), lint of the changed files (all of them when the lint configuration or what its rules read
//   changed), the unit tests related to the changed files (vitest follows every import, JSON and import.meta.glob
//   included) and those that read files themselves, manifest:check and gen:check;
// - the browser tests the dependency map cannot vouch for (tools/impact/impact.ts decide): the rest keep their last
//   result. A failure the change cannot affect, static or browser, stays listed as open, and does not fail this check:
//   it fails the checkpoint (npm run verify:fast, npm run e2e) until it is fixed.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { decide, environmentHash, environmentParts, git, listTestsAsync, localImports, readBuild, readMap, scenarioPrint, snapshotTree, specsAffected, writeMap, type Decision } from './impact.ts';
import { lintFailures, problemFailures, readStatics, splitFailures, typecheckFailures, unitReport, writeStatics, type Failure } from './statics.ts';

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
const phase = (what: string) => console.log(`check: [${elapsed()}] ${what}`);
const title = (id: string) => (JSON.parse(id) as string[]).join(' › ');
const exec = (command: string, env: NodeJS.ProcessEnv = {}) =>
  new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(command, { shell: true, env: { ...process.env, FORCE_COLOR: '0', ...env } });
    let output = '';
    child.stdout.on('data', (c: Buffer) => (output += c.toString()));
    child.stderr.on('data', (c: Buffer) => (output += c.toString()));
    child.on('close', (c) => resolve({ code: c ?? 1, output }));
  });
const NODE = `"${process.execPath}"`;
const commitExists = (sha: string) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
const changedSince = (sha: string, tree: string) => git(['diff', '--name-only', sha, tree]).split('\n').filter((f) => f !== '');
const projectPath = (absolute: string) => path.relative(process.cwd(), absolute).replace(/\\/g, '/');

// 1. at the same time: the build the tests will run against (then what it is made of), the suite's list of tests,
// and the browser's version
const VITE = `${NODE} node_modules/vite/bin/vite.js`;
const building = exec(`${VITE} build --logLevel warn && ${VITE} build --config vite.proofs.config.ts --logLevel warn`, { E2E_BUILD: '1' });
const listing = listTestsAsync();
const version = chromium.launch({ channel: 'chrome' }).then(async (b) => {
  const v = b.version();
  await b.close();
  return v;
});
const snapshot = snapshotTree();

// 2. the static checks, on what changed since they last ran; they run while the build and the browser tests do
const ledger = readStatics();
const staticsKnown = ledger !== null && commitExists(ledger.snapshot);
const staticChanged = staticsKnown && ledger ? changedSince(ledger.snapshot, snapshot) : [];
const touched = new Set(staticChanged);
const held = (name: string): readonly string[] => (staticsKnown ? (ledger?.failures[name] ?? []) : []);
const existing = (files: readonly string[]) => [...new Set(files)].filter((f) => fs.existsSync(f));
const reportFile = (name: string) => path.join('.cache', 'impact', `${name}-${process.pid}.json`);
// a list of files longer than this goes to the whole check instead (the command line has a limit)
const MANY = 200;

interface StaticResult {
  readonly name: string;
  readonly code: number;
  // what the check printed, shown when it fails this check
  readonly output: string;
  readonly blocking: readonly Failure[];
  readonly open: readonly Failure[];
  // the failures the ledger keeps for the next run
  readonly hold: readonly string[];
}
// a check that failed without reporting what failed (it crashed, or its configuration is broken) always fails
const crashed = (name: string, r: { code: number; output: string }): StaticResult => ({ name, ...r, blocking: [{ key: `${name} exit ${r.code}`, file: '' }], open: [], hold: [`${name} exit ${r.code}`] });
const settle = (name: string, r: { code: number; output: string }, failures: readonly Failure[], changed: ReadonlySet<string>): StaticResult => {
  if (r.code !== 0 && failures.length === 0) return crashed(name, r);
  return { name, ...r, ...splitFailures(failures, held(name), changed), hold: failures.map((f) => f.key) };
};

const steps: Promise<StaticResult>[] = [];
const anyHeld = staticsKnown && ledger !== null && Object.values(ledger.failures).some((f) => f.length > 0);
if (!staticsKnown || staticChanged.length > 0 || anyHeld) {
  // the type check covers the whole program every time (incremental: only what changed is checked again)
  for (const [name, config] of [
    ['typecheck:app', 'tsconfig.app.json'],
    ['typecheck:node', 'tsconfig.node.json'],
  ] as const) {
    const info = `.cache/tsbuildinfo-${name.split(':')[1] ?? ''}`;
    steps.push(exec(`${NODE} node_modules/typescript/bin/tsc -p ${config} --noEmit --pretty false --incremental --tsBuildInfoFile ${info}`).then((r) => settle(name, r, typecheckFailures(r.output), touched)));
  }

  // lint: the changed files and those that failed; every file when the configuration, a module it imports (the
  // project's own rules) or a file its rules read at run time changed (the tokens, tools/lint/style-values.ts)
  const lintInputs = new Set([...localImports('eslint.config.js')].map(projectPath));
  for (const f of ['src/ui/tokens.css', 'package-lock.json']) lintInputs.add(f);
  const linted = existing([...staticChanged.filter((f) => /\.(js|mjs|cjs|ts|mts|cts|tsx|css)$/.test(f)), ...held('lint')]);
  const lintAll = !staticsKnown || staticChanged.some((f) => lintInputs.has(f)) || linted.length > MANY;
  if (lintAll || linted.length > 0) {
    const report = reportFile('lint');
    const targets = lintAll ? '.' : linted.join(' ');
    steps.push(
      exec(`${NODE} node_modules/eslint/bin/eslint.js --max-warnings 0 --no-warn-ignored --cache --cache-location .cache/eslintcache --format json --output-file ${report} ${targets}`).then((r) => {
        if (!fs.existsSync(report)) return crashed('lint', r);
        const json = fs.readFileSync(report, 'utf8');
        fs.rmSync(report, { force: true });
        const failures = lintFailures(json, process.cwd());
        return settle('lint', { code: r.code, output: r.output + failures.map((f) => f.text).join('\n') }, failures, touched);
      }),
    );
  }

  // unit tests: those related to what changed, and those that read files themselves (vitest's module graph cannot
  // see what they read: every unit test whose own imports reach node:fs or node:child_process); every one when the
  // test configuration, the packages or the compiler settings changed. The tests that failed run apart: a failure
  // there that this change does not touch stays open.
  const unitTests = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? unitTests(path.join(dir, e.name)) : /\.test\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const readers = ['src', 'tools'].flatMap(unitTests).filter((t) => [...localImports(t)].some((m) => /['"](node:)?(fs|fs\/promises|child_process)['"]/.test(fs.readFileSync(m, 'utf8'))));
  const related = existing([...staticChanged, ...(staticChanged.length > 0 ? readers.map((t) => t.replace(/\\/g, '/')) : [])]);
  const unitAll = !staticsKnown || staticChanged.some((f) => ['vitest.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'].includes(f)) || related.length > MANY;
  const failing = unitAll ? [] : existing(held('unit'));
  if (unitAll || related.length > 0 || failing.length > 0) {
    const VITEST = `${NODE} node_modules/vitest/vitest.mjs`;
    const run = async (args: string | null, report: string) => {
      if (args === null) return { code: 0, output: '', ran: [] as string[], failed: [] as Failure[], ok: true };
      const r = await exec(`${VITEST} ${args} --passWithNoTests --reporter=default --reporter=json --outputFile.json=${report}`);
      if (!fs.existsSync(report)) return { ...r, ran: [], failed: [], ok: false };
      const parsed = unitReport(fs.readFileSync(report, 'utf8'), process.cwd());
      fs.rmSync(report, { force: true });
      return { ...r, ...parsed, ok: true };
    };
    steps.push(
      Promise.all([run(unitAll ? 'run' : related.length > 0 ? `related --run ${related.join(' ')}` : null, reportFile('unit')), run(failing.length > 0 ? `run ${failing.join(' ')}` : null, reportFile('unit-open'))]).then(([mine, before]) => {
        const r = { code: mine.code || before.code, output: mine.output + before.output };
        if (!mine.ok || !before.ok) return crashed('unit', r);
        // a failed test file this change's run took in fails this check; one only the run of the failures took in
        // stays open
        const blocking = mine.failed;
        const open = before.failed.filter((f) => !mine.ran.includes(f.file));
        return { name: 'unit', ...r, blocking, open, hold: [...blocking, ...open].map((f) => f.key) };
      }),
    );
  }

  // the whole-project checks read the whole project (manifest:check reads every source file for its registrations,
  // the catalogues and ARCHITECTURE.md; gen:check the manifest, the design tokens and packages): they run every time
  for (const [name, script] of [
    ['manifest:check', 'tools/manifest/check.ts'],
    ['gen:check', 'tools/gen/check.ts'],
  ] as const) {
    steps.push(exec(`${NODE} ${script}`).then((r) => (r.code === 0 ? { name, ...r, blocking: [], open: [], hold: [] } : settle(name, r, problemFailures(r.output), new Set()))));
  }
}
const staticRuns = Promise.all(steps);

// 3. the browser tests the change can affect
const build = await building;
if (build.code !== 0) {
  process.stdout.write(build.output);
  console.log('check: the e2e build failed');
  process.exit(1);
}
const app = readBuild();
phase('built and analysed');
const parts = environmentParts(await version);
const environment = environmentHash(parts);
const map = readMap();
const snapshotKnown = map !== null && commitExists(map.snapshot);
const changed = snapshotKnown && map ? changedSince(map.snapshot, snapshot) : [];
const tests = await listing;
phase('listed the suite');
const testSide = specsAffected(changed);
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

console.log(`check: ${changed.length} files changed since the browser tests' last validated tree${changed.length > 0 ? `: ${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', ...' : ''}` : ''}`);
console.log(`check: ${staticsKnown ? `${staticChanged.length} files changed since the static checks last ran` : 'the static checks run on every file (they have no earlier run)'}`);
if (decision.broad) console.log(`check: every browser test runs: ${decision.broad}`);
else {
  const byReason = new Map<string, number>();
  for (const reason of decision.selected.values()) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  for (const [reason, n] of byReason) console.log(`check:   ${n} test(s): ${reason}`);
}
console.log(`check: selected ${decision.selected.size} of ${tests.length} browser tests; ${decision.valid.length} keep their last pass (nothing they depend on changed)`);
for (const f of decision.openFailures) console.log(`check: OPEN FAILURE (not affected by this change, still failing): ${title(f.id)}${f.error ? ` - ${f.error}` : ''}`);

if (process.argv.includes('--dry-run')) {
  // what would run and why, without running the browser tests
  for (const [id, reason] of decision.selected) console.log(`check:   would run ${title(id)} (${reason})`);
}
phase('decided');

// 4. run them, while the static checks finish; the teardown records them in the map and moves its snapshot here
let browserCode = 0;
if (process.argv.includes('--dry-run')) {
  // nothing runs
} else if (decision.selected.size > 0) {
  const selectionFile = path.join('.cache', 'impact', `selection-${process.pid}.json`);
  fs.mkdirSync(path.dirname(selectionFile), { recursive: true });
  fs.writeFileSync(selectionFile, JSON.stringify([...decision.selected.keys()]));
  browserCode = await new Promise<number>((resolve) => {
    const child = spawn(`${NODE} node_modules/@playwright/test/cli.js test`, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, E2E_SELECTION: selectionFile, E2E_PREBUILT: '1', E2E_CHECK: '1', E2E_SNAPSHOT: snapshot, E2E_RUN_ID: `check-${process.pid}` },
    });
    child.on('close', (c) => resolve(c ?? 1));
  });
  fs.rmSync(selectionFile, { force: true });
  phase('browser tests done');
} else if (map !== null) {
  // nothing to run: every test keeps its result, and the validated tree is this one
  writeMap({ ...map, snapshot });
}

const staticResults = await staticRuns;
phase('static checks done');
if (steps.length > 0) writeStatics({ snapshot, failures: Object.fromEntries(staticResults.map((r) => [r.name, r.hold])) });
for (const r of staticResults) {
  if (r.blocking.length > 0) process.stdout.write(r.output.endsWith('\n') ? r.output : `${r.output}\n`);
  console.log(`check: ${r.name} exit ${r.code}${r.open.length > 0 ? ` (${r.open.length} open, not affected by this change)` : ''}`);
  for (const f of r.open) console.log(`check: OPEN FAILURE (${r.name}, not affected by this change, still failing): ${f.text ?? f.key}`);
}
const failedStatics = staticResults.filter((r) => r.blocking.length > 0).map((r) => r.name);
const openCount = decision.openFailures.length + staticResults.reduce((n, r) => n + r.open.length, 0);
const ok = failedStatics.length === 0 && browserCode === 0;
console.log(`check: ${ok ? 'PASSED' : 'FAILED'} in ${elapsed()}${failedStatics.length > 0 ? ` (static: ${failedStatics.join(', ')})` : ''}${browserCode !== 0 ? ' (browser tests)' : ''}${openCount > 0 ? `; ${openCount} open failure(s) the change does not affect, listed above` : ''}`);
process.exit(ok ? 0 : 1);
