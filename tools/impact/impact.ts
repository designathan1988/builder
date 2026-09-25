// The dependency map of the browser suite and the choice of the tests a change can affect (docs/testing/README.md).
//
// After every browser run, each test's record (tests/support/test.ts: the functions it executed, the CSS rules it
// used, the classes it saw) is turned into content keys of the build it ran against and kept in .cache/impact/map.json
// with its result. A later check runs a test again unless it can show that nothing the test depends on changed:
// - every function it executed still exists with the same own code (tools/impact/analyze.ts);
// - the load-time code of the app (outside every function, run by every test) is the same;
// - every CSS rule it used is still there, in the same order, and no new rule can match an element it had;
// - its own test code and every module that code imports is unchanged (Playwright's --only-changed);
// - no input outside the bundle changed: the environment (configs, lockfile, test support, this tool, the browser,
//   Node and Playwright), the data the tests read at runtime (manifest, catalogues, fixtures, generated files), the
//   other files of the build; the scenario data of a runner test is compared scenario by scenario.
// Anything it cannot show widens the run, up to the whole suite. A failed test stays in the map, reported as open,
// and runs again as soon as anything it depends on changes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { analyzeCss, analyzeScript, functionAt, functionIndex, hash, type CssRuleFact, type FunctionFact, type ScriptFacts } from './analyze.ts';

export const MAP_FILE = path.join('.cache', 'impact', 'map.json');
export const RAW_DIR = path.join('.cache', 'impact', 'raw');
export const DIST = 'dist';
const VERSION = 1;

// A change to any of these makes every test run: they shape how every test runs or what it is.
export const ENVIRONMENT_FILES = ['package.json', 'package-lock.json', 'playwright.config.ts', 'vite.config.ts', 'vite.proofs.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'index.html', 'tools/runner/tooth-plugin.ts'];
export const ENVIRONMENT_DIRS = ['tests/support/', 'tools/impact/'];
// Data the tests read from disk at runtime (fs.readFileSync in the specs, door.ts and the runner), invisible to the
// import graph: a change makes every test run. The scenario files are compared scenario by scenario instead.
export const TEST_DATA_DIRS = ['manifest/', 'src/i18n/', 'src/generated/', 'design/'];
export const SCENARIO_FILES = /^manifest\/features\/[^/]+\.json$/;
// the census reads every scenario of every registered feature
export const WHOLE_SCENARIO_READERS = ['census.spec.ts'];

export interface BuildEntry {
  readonly keyCounts: Record<string, number>;
  readonly loadTime: string;
  readonly cssKeys: readonly string[];
  readonly assets: string;
}

export interface TestEntry {
  readonly id: string;
  readonly file: string;
  readonly status: string;
  readonly error: string | null;
  readonly complete: boolean;
  readonly build: string;
  readonly keys: readonly string[];
  readonly sources: readonly string[];
  readonly css: readonly string[];
  readonly classes: readonly string[];
  readonly scenario: string | null;
  readonly at: string;
}

export interface ImpactMap {
  readonly version: number;
  readonly environment: string;
  readonly environmentParts: Record<string, string>;
  readonly snapshot: string;
  readonly builds: Record<string, BuildEntry>;
  readonly tests: Record<string, TestEntry>;
}

export const git = (args: readonly string[], env: NodeJS.ProcessEnv = process.env): string => {
  const r = spawnSync('git', args, { encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

// A commit object holding the working tree as it is now, untracked files included, kept alive by a ref of this
// checkout so that a later check can diff against it.
export function snapshotTree(): string {
  const index = path.join('.cache', 'impact', `index-${process.pid}`);
  fs.mkdirSync(path.dirname(index), { recursive: true });
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], env);
    git(['add', '-A', '.'], env);
    const tree = git(['write-tree'], env);
    const commit = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'impact snapshot'], env);
    git(['update-ref', `refs/impact/${hash(process.cwd())}`, commit]);
    return commit;
  } finally {
    fs.rmSync(index, { force: true });
  }
}

const fileHash = (file: string): string => (fs.existsSync(file) ? hash(fs.readFileSync(file, 'utf8')) : 'absent');
const filesUnder = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name).replace(/\\/g, '/')).sort() : [];

export function environmentParts(browserVersion: string): Record<string, string> {
  const pw = JSON.parse(fs.readFileSync('node_modules/@playwright/test/package.json', 'utf8')) as { version: string };
  const parts: Record<string, string> = { node: process.version, platform: `${process.platform}-${process.arch}`, playwright: pw.version, browser: browserVersion };
  for (const f of ENVIRONMENT_FILES) parts[f] = fileHash(f);
  for (const d of ENVIRONMENT_DIRS) for (const f of filesUnder(d).filter((f) => !f.endsWith('.test.ts'))) parts[f] = fileHash(f);
  return parts;
}

export const environmentHash = (parts: Record<string, string>): string => hash(JSON.stringify(Object.entries(parts).sort()));

export interface BuiltApp {
  readonly id: string;
  readonly scripts: ReadonlyMap<string, { readonly facts: ScriptFacts; readonly index: ReadonlyMap<string, FunctionFact> }>;
  readonly css: ReadonlyMap<string, readonly CssRuleFact[]>;
  readonly entry: BuildEntry;
  readonly rules: readonly CssRuleFact[];
}

// Reads the e2e build in dist/: every script and stylesheet it serves, and a hash of every other file it serves.
export function readBuild(dist: string = DIST): BuiltApp {
  const files = filesUnder(dist);
  const served = (f: string) => `/${path.relative(dist, f).replace(/\\/g, '/')}`;
  const scripts = new Map<string, { facts: ScriptFacts; index: ReturnType<typeof functionIndex> }>();
  const css = new Map<string, CssRuleFact[]>();
  const keyCounts: Record<string, number> = {};
  let loadTime = '';
  let others = '';
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.js')) {
      const facts = analyzeScript(text);
      scripts.set(served(f), { facts, index: functionIndex(facts) });
      for (const [k, n] of facts.keyCounts) keyCounts[k] = (keyCounts[k] ?? 0) + n;
      loadTime += hash(facts.loadTime);
    } else if (f.endsWith('.css')) css.set(served(f), analyzeCss(text));
    else if (!f.endsWith('.map')) {
      // the page and every other asset (icons, fonts): the hashed asset names in index.html are not content
      others += `${served(f).replace(/-[A-Za-z0-9_-]{8}\./, '.')}:${hash(text.replace(/-[A-Za-z0-9_-]{8}\.(js|css)/g, '.$1'))};`;
    }
  }
  const rules = [...css.keys()].sort().flatMap((k) => css.get(k) ?? []);
  const entry: BuildEntry = { keyCounts, loadTime: hash(loadTime), cssKeys: rules.map((r) => r.key), assets: hash(others) };
  const id = hash(JSON.stringify([entry.loadTime, entry.cssKeys, entry.assets, Object.entries(keyCounts).sort()]));
  return { id, scripts, css, entry, rules };
}

// The data a runner test reads for its scenario: the scenario, its feature without the scenarios, its fixture.
interface FeatureData {
  readonly id: string;
  readonly scenarios?: readonly { readonly id: string; readonly setup?: { readonly fixture?: string } }[];
}
let featuresRead: readonly FeatureData[] | null = null;
const features = (): readonly FeatureData[] =>
  (featuresRead ??= fs
    .readdirSync('manifest/features')
    .filter((f) => f.endsWith('.json'))
    .flatMap((file) => (JSON.parse(fs.readFileSync(path.join('manifest/features', file), 'utf8')) as { features: FeatureData[] }).features));
export function scenarioPrint(id: string): string | null {
  const titles = JSON.parse(id) as string[];
  if (titles[0] !== 'scenarios.spec.ts' || titles.length < 2) return null;
  const [featureId, scenarioId] = (titles[titles.length - 1] ?? '').split(' › ');
  const feature = features().find((f) => f.id === featureId);
  const scenario = feature?.scenarios?.find((s) => s.id === scenarioId);
  if (!feature || !scenario) return 'absent';
  const rest = { ...feature, scenarios: undefined };
  const fixture = scenario.setup?.fixture ? path.join('manifest/features/fixtures', `${scenario.setup.fixture}.json`) : '';
  return hash(JSON.stringify([rest, scenario, fixture === '' ? '' : fileHash(fixture)]));
}

export interface RawRecord {
  readonly id: string;
  readonly browser: string;
  readonly status: string;
  readonly error: string | null;
  readonly complete: boolean;
  readonly pages: readonly { readonly js: Record<string, [number, number][]>; readonly css: Record<string, [number, number][]> }[];
  readonly classes: readonly string[];
}

// One raw record as the content keys of the build it ran against.
export function entryOf(raw: RawRecord, build: BuiltApp): TestEntry {
  const keys = new Set<string>();
  const sources = new Set<string>();
  const used = new Set<string>();
  let complete = raw.complete;
  for (const page of raw.pages) {
    for (const [script, ranges] of Object.entries(page.js)) {
      const s = build.scripts.get(script);
      if (!s) {
        complete = false; // a script this build does not have: the record belongs to another build
        continue;
      }
      for (const [start, end] of ranges) {
        const f = functionAt(s.facts, s.index, start, end);
        if (f) {
          keys.add(f.key);
          sources.add(f.region);
        }
      }
    }
    for (const [sheet, ranges] of Object.entries(page.css)) {
      const rules = build.css.get(sheet);
      if (!rules) {
        complete = false;
        continue;
      }
      for (const r of rules) if (ranges.some(([a, b]) => a < r.end && r.start < b)) used.add(r.key);
    }
  }
  const file = (JSON.parse(raw.id) as string[])[0] ?? '';
  return {
    id: raw.id,
    file,
    status: raw.status,
    error: raw.error,
    complete,
    build: build.id,
    keys: [...keys].sort(),
    sources: [...sources].sort(),
    css: build.entry.cssKeys.filter((k) => used.has(k)),
    classes: raw.classes,
    scenario: scenarioPrint(raw.id),
    at: new Date().toISOString(),
  };
}

export function readMap(): ImpactMap | null {
  if (!fs.existsSync(MAP_FILE)) return null;
  const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) as ImpactMap;
  return map.version === VERSION ? map : null;
}

export function writeMap(map: Omit<ImpactMap, 'version'>): void {
  // only the builds a test still refers to are kept
  const referenced = new Set(Object.values(map.tests).map((t) => t.build));
  const builds = Object.fromEntries(Object.entries(map.builds).filter(([id]) => referenced.has(id)));
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  const tmp = `${MAP_FILE}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, ...map, builds }));
  fs.renameSync(tmp, MAP_FILE);
}

// The spec files whose own code, or any module they import (statically, dynamically or by require, followed through
// every local file), changed. Playwright's --only-changed is not enough: it keeps only the tests whose declaration
// sits in a changed file's dependents by the test's own location, so the 163 scenario tests, declared in
// tools/runner/scenarios.ts and loaded by tests/e2e/scenarios.spec.ts, were left out when a module the runner
// imports changed (measured: tests/e2e/door.ts changed, 159 tests selected, none of the runner's).
export function specsAffected(changedFiles: readonly string[], testDir = 'tests/e2e'): Set<string> {
  const changed = new Set(changedFiles.map((f) => path.resolve(f)));
  const closure = new Map<string, Set<string>>();
  const resolveLocal = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(from), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    return null;
  };
  const importsOf = (file: string): Set<string> => {
    const known = closure.get(file);
    if (known) return known;
    const seen = new Set<string>([file]);
    closure.set(file, seen);
    const stack = [file];
    while (stack.length > 0) {
      const at = stack.pop() ?? '';
      if (!/\.(ts|tsx|js|mjs)$/.test(at)) continue;
      for (const ref of ts.preProcessFile(fs.readFileSync(at, 'utf8'), true, true).importedFiles) {
        const target = resolveLocal(at, ref.fileName);
        if (target !== null && !seen.has(target)) {
          seen.add(target);
          stack.push(target);
        }
      }
    }
    return seen;
  };
  const affected = new Set<string>();
  for (const spec of fs.readdirSync(testDir).filter((f) => f.endsWith('.spec.ts'))) {
    if ([...importsOf(path.resolve(testDir, spec))].some((f) => changed.has(f))) affected.add(spec);
  }
  return affected;
}

// Every test of the suite as Playwright lists it (the same id as tests/support/test.ts builds).
export function listTests(): string[] {
  const args = ['playwright', 'test', '--list', '--reporter=json'];
  const r = spawnSync(`npx ${args.join(' ')}`, { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, E2E_SELECTION: '' } });
  const start = r.stdout.indexOf('{');
  if (start < 0) throw new Error(`playwright --list failed: ${r.stderr || r.stdout}`);
  interface Suite {
    readonly title: string;
    readonly specs?: readonly { readonly title: string }[];
    readonly suites?: readonly Suite[];
  }
  const report = JSON.parse(r.stdout.slice(start)) as { suites: Suite[] };
  const ids: string[] = [];
  const walk = (s: Suite, chain: readonly string[]) => {
    for (const spec of s.specs ?? []) ids.push(JSON.stringify([...chain, spec.title]));
    for (const inner of s.suites ?? []) walk(inner, [...chain, inner.title]);
  };
  for (const s of report.suites) walk(s, [s.title]);
  return ids;
}

export interface Decision {
  readonly selected: Map<string, string>;
  readonly valid: string[];
  readonly openFailures: { readonly id: string; readonly error: string | null }[];
  readonly broad: string | null;
}

export interface SelectionInput {
  readonly map: ImpactMap | null;
  readonly environment: string;
  readonly environmentParts: Record<string, string>;
  readonly changedFiles: readonly string[];
  // the spec files whose test code changed (specsAffected)
  readonly testSide: ReadonlySet<string>;
  readonly tests: readonly string[];
  readonly build: BuiltApp;
  readonly scenarioOf: (id: string) => string | null;
  readonly unmappedFiles: ReadonlySet<string>;
}

// Which tests must run, and why; every other test's last result still holds.
export function decide(input: SelectionInput): Decision {
  const selected = new Map<string, string>();
  const everyTest = (reason: string): Decision => ({ selected: new Map(input.tests.map((t) => [t, reason])), valid: [], openFailures: [], broad: reason });
  const map = input.map;
  if (map === null) return everyTest('no dependency map yet');
  if (map.environment !== input.environment) {
    const changed = Object.keys({ ...map.environmentParts, ...input.environmentParts }).filter((k) => map.environmentParts[k] !== input.environmentParts[k]);
    return everyTest(`the environment changed: ${changed.slice(0, 4).join(', ')}`);
  }
  for (const f of input.changedFiles) {
    if (ENVIRONMENT_FILES.includes(f) || (ENVIRONMENT_DIRS.some((d) => f.startsWith(d)) && !f.endsWith('.test.ts'))) return everyTest(`the environment changed: ${f}`);
    if (TEST_DATA_DIRS.some((d) => f.startsWith(d)) && !SCENARIO_FILES.test(f)) return everyTest(`data the tests read at runtime changed: ${f}`);
  }
  const scenariosChanged = input.changedFiles.some((f) => SCENARIO_FILES.test(f));
  const now = input.build.entry;
  const nowRules = new Set(now.cssKeys);
  const openFailures: { id: string; error: string | null }[] = [];
  const valid: string[] = [];
  for (const id of input.tests) {
    const entry = map.tests[id];
    const reason = ((): string | null => {
      if (!entry) return 'new, or never recorded';
      if (!entry.complete) return 'its last record is incomplete';
      if (input.unmappedFiles.has(entry.file)) return 'it opens pages the recorder does not follow';
      if (input.testSide.has(entry.file)) return 'its test code or a module it imports changed';
      if (entry.scenario !== null && input.scenarioOf(id) !== entry.scenario) return 'its scenario, feature or fixture changed';
      if (scenariosChanged && WHOLE_SCENARIO_READERS.includes(entry.file)) return 'it reads every scenario, and a scenario file changed';
      const was = map.builds[entry.build];
      if (!was) return 'the build it ran against is not in the map';
      if (was.assets !== now.assets) return 'a file the app loads at runtime changed';
      if (was.loadTime !== now.loadTime) return 'the app code that runs at load changed';
      for (const k of entry.keys) if ((now.keyCounts[k] ?? 0) < (was.keyCounts[k] ?? 1)) return 'a function it executed changed';
      let at = -1;
      for (const k of entry.css) {
        if (!nowRules.has(k)) return 'a CSS rule it used changed';
        const i = now.cssKeys.indexOf(k, at + 1);
        if (i < 0) return 'the order of the CSS rules it used changed';
        at = i;
      }
      const before = new Set(was.cssKeys);
      const classes = new Set(entry.classes);
      for (const r of input.build.rules) {
        if (before.has(r.key)) continue;
        if (r.subjectClasses === null) return 'a new CSS rule can match any element';
        if (r.subjectClasses.some((need) => need.every((c) => classes.has(c)))) return 'a new CSS rule matches an element it had';
      }
      return null;
    })();
    if (reason !== null) selected.set(id, reason);
    else if (entry && entry.status !== 'passed' && entry.status !== 'skipped') openFailures.push({ id, error: entry.error });
    else valid.push(id);
  }
  return { selected, valid, openFailures, broad: null };
}

export const shortHash = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 12);
