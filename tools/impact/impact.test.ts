// The limited validation's rules (docs/testing/README.md): what a test depends on, and when a change reaches it.
import { describe, expect, it } from 'vitest';
import { analyzeCss, analyzeScript } from './analyze.ts';
import { decide, specsAffected, type BuildEntry, type BuiltApp, type ImpactMap, type SelectionInput, type TestEntry } from './impact.ts';

describe('the spec files a test-side change reaches', () => {
  it('follows every local import, also to the tests the scenario runner declares outside the spec file', () => {
    // Playwright's --only-changed left the 163 scenario tests out when tests/e2e/door.ts changed
    const doorChange = specsAffected(['tests/e2e/door.ts']);
    expect(doorChange.has('scenarios.spec.ts')).toBe(true);
    expect(doorChange.has('menus.spec.ts')).toBe(true);
    expect(specsAffected(['tools/runner/unzip.ts']).has('scenarios.spec.ts')).toBe(true);
    expect([...specsAffected(['tests/e2e/smoke.spec.ts'])]).toEqual(['smoke.spec.ts']);
    expect(specsAffected(['docs/testing/README.md']).size).toBe(0);
  });
});

const SCRIPT = `//#region src/a.ts
function outer() { const inner = () => 1; return inner() + 1; }
const table = { x: 1 };
//#endregion
`;

describe('the bundle analysis', () => {
  it('keys a function by its own code: changing a nested function changes only the nested one', () => {
    const before = analyzeScript(SCRIPT);
    const after = analyzeScript(SCRIPT.replace('() => 1', '() => 2'));
    const keys = (s: typeof before) => s.functions.map((f) => f.key);
    expect(keys(before)).toHaveLength(2);
    expect(keys(after)[0]).toBe(keys(before)[0]);
    expect(keys(after)[1]).not.toBe(keys(before)[1]);
    expect(before.functions.every((f) => f.region === 'src/a.ts')).toBe(true);
  });
  it('keeps the load-time code apart from the functions', () => {
    const before = analyzeScript(SCRIPT);
    expect(analyzeScript(SCRIPT.replace('() => 1', '() => 2')).loadTime).toBe(before.loadTime);
    expect(analyzeScript(SCRIPT.replace('x: 1', 'x: 2')).loadTime).not.toBe(before.loadTime);
  });
  it("names the classes a rule's subject needs, or none when it can match any element", () => {
    const rules = analyzeCss('.a .b.c { color: red } .d, e { color: red } :root { --x: 1 } @font-face { font-family: f }');
    expect(rules.map((r) => r.subjectClasses)).toEqual([[['b', 'c']], null, null, null]);
  });
});

const build = (entry: Partial<BuildEntry>, rules = analyzeCss('.a { color: red }')): BuiltApp => ({
  id: 'now',
  scripts: new Map(),
  css: new Map(),
  rules,
  entry: { keyCounts: { f1: 1, f2: 1 }, loadTime: 'L', cssKeys: rules.map((r) => r.key), assets: 'A', ...entry },
});
const test = (id: string, partial: Partial<TestEntry> = {}): TestEntry => ({
  id,
  file: 'a.spec.ts',
  status: 'passed',
  error: null,
  complete: true,
  build: 'was',
  keys: ['f1'],
  sources: [],
  css: [],
  classes: ['a'],
  scenario: null,
  at: '',
  ...partial,
});
const ids = ['["a.spec.ts","one"]', '["a.spec.ts","two"]'];
const map = (tests: TestEntry[], was: Partial<BuildEntry> = {}): ImpactMap => ({
  version: 1,
  environment: 'E',
  environmentParts: { node: 'v' },
  snapshot: 'S',
  builds: { was: { keyCounts: { f1: 1, f2: 1 }, loadTime: 'L', cssKeys: build({}).entry.cssKeys, assets: 'A', ...was } },
  tests: Object.fromEntries(tests.map((t) => [t.id, t])),
});
const input = (partial: Partial<SelectionInput>): SelectionInput => ({
  map: map([test(ids[0] ?? ''), test(ids[1] ?? '', { keys: ['f2'] })]),
  environment: 'E',
  environmentParts: { node: 'v' },
  changedFiles: [],
  testSide: new Set(),
  tests: ids,
  build: build({}),
  scenarioOf: () => null,
  unmappedFiles: new Set(),
  ...partial,
});

describe('the choice of the tests a change can affect', () => {
  it('runs nothing when nothing a test depends on changed', () => {
    const d = decide(input({}));
    expect([...d.selected.keys()]).toEqual([]);
    expect(d.valid).toEqual(ids);
  });
  it('runs only the test that executed a changed function', () => {
    const d = decide(input({ build: build({ keyCounts: { f1: 1, f2changed: 1 } }) }));
    expect([...d.selected.keys()]).toEqual([ids[1]]);
  });
  it('runs every test when the load-time code, an environment input, runtime test data or the map itself changed', () => {
    expect(decide(input({ build: build({ loadTime: 'other' }) })).selected.size).toBe(2);
    expect(decide(input({ changedFiles: ['playwright.config.ts'] })).broad).toMatch(/environment/);
    expect(decide(input({ changedFiles: ['package-lock.json'] })).broad).toMatch(/environment/);
    expect(decide(input({ changedFiles: ['tests/support/editor.ts'] })).broad).toMatch(/environment/);
    expect(decide(input({ changedFiles: ['manifest/commands/structure.json'] })).broad).toMatch(/runtime/);
    expect(decide(input({ changedFiles: ['src/i18n/locales/en.json'] })).broad).toMatch(/runtime/);
    expect(decide(input({ changedFiles: ['manifest/features/fixtures/aurora.json'] })).broad).toMatch(/runtime/);
    expect(decide(input({ environment: 'E2', environmentParts: { node: 'w' } })).broad).toMatch(/environment/);
    expect(decide(input({ map: null })).broad).toMatch(/no dependency map/);
    expect(decide(input({ build: build({ assets: 'B' }) })).selected.size).toBe(2);
  });
  it('runs a test whose own code or an imported module changed, a new test, and one that opens pages it does not record', () => {
    expect(decide(input({ testSide: new Set(['a.spec.ts']) })).selected.size).toBe(2);
    expect(decide(input({ testSide: new Set(['b.spec.ts']) })).selected.size).toBe(0);
    expect([...decide(input({ tests: [...ids, '["a.spec.ts","three"]'] })).selected.keys()]).toEqual(['["a.spec.ts","three"]']);
    expect(decide(input({ unmappedFiles: new Set(['a.spec.ts']) })).selected.size).toBe(2);
  });
  it('compares a runner test scenario by scenario, and runs the census when any scenario file changed', () => {
    const scenario = map([test(ids[0] ?? '', { scenario: 's1' }), test(ids[1] ?? '', { scenario: 's2' }), test('["census.spec.ts","c"]', { file: 'census.spec.ts' })]);
    const d = decide(input({ map: scenario, tests: [...ids, '["census.spec.ts","c"]'], changedFiles: ['manifest/features/02-structure-editing.json'], scenarioOf: (id) => (id === ids[0] ? 's1-changed' : id === ids[1] ? 's2' : null) }));
    expect([...d.selected.keys()]).toEqual([ids[0], '["census.spec.ts","c"]']);
  });
  it('follows the CSS a test used and the new rules that can reach it', () => {
    const rules = analyzeCss('.a { color: red }');
    const used = map([test(ids[0] ?? '', { css: rules.map((r) => r.key) }), test(ids[1] ?? '', { keys: ['f2'], classes: ['z'] })]);
    expect([...decide(input({ map: used, build: build({}, analyzeCss('.a { color: blue }')) })).selected.keys()]).toEqual([ids[0]]);
    // a new rule for class a reaches only the test that had an element with class a
    expect([...decide(input({ map: used, build: build({}, analyzeCss('.a { color: red } .x .a { margin: 0 }')) })).selected.keys()]).toEqual([ids[0]]);
    // a new rule no element can escape
    expect(decide(input({ map: used, build: build({}, analyzeCss('.a { color: red } button { margin: 0 }')) })).selected.size).toBe(2);
    // the same rules in another order: the cascade between them may differ
    const two = analyzeCss('.a { color: red } .b { color: blue }');
    const ordered = map([test(ids[0] ?? '', { css: two.map((r) => r.key) }), test(ids[1] ?? '', { keys: ['f2'], classes: ['z'] })], { cssKeys: two.map((r) => r.key) });
    expect(decide(input({ map: ordered, build: build({}, two) })).selected.size).toBe(0);
    const swapped = decide(input({ map: ordered, build: build({}, analyzeCss('.b { color: blue } .a { color: red }')) }));
    expect([...swapped.selected]).toEqual([[ids[0], 'the order of the CSS rules it used changed']]);
  });
  it('runs a test whose last record is incomplete, or whose build the map no longer holds', () => {
    const incomplete = map([test(ids[0] ?? '', { complete: false }), test(ids[1] ?? '', { keys: ['f2'] })]);
    expect([...decide(input({ map: incomplete })).selected]).toEqual([[ids[0], 'its last record is incomplete']]);
    const orphan = map([test(ids[0] ?? '', { build: 'gone' }), test(ids[1] ?? '', { keys: ['f2'] })]);
    expect([...decide(input({ map: orphan })).selected]).toEqual([[ids[0], 'the build it ran against is not in the map']]);
  });
  it('keeps a failure open, without running it, until something it depends on changes', () => {
    const failed = map([test(ids[0] ?? '', { status: 'failed', error: 'boom' }), test(ids[1] ?? '', { keys: ['f2'] })]);
    const unaffected = decide(input({ map: failed, build: build({ keyCounts: { f1: 1, f2changed: 1 } }) }));
    expect([...unaffected.selected.keys()]).toEqual([ids[1]]);
    expect(unaffected.openFailures).toEqual([{ id: ids[0], error: 'boom' }]);
    const affected = decide(input({ map: failed, build: build({ keyCounts: { f1changed: 1, f2: 1 } }) }));
    expect([...affected.selected.keys()]).toEqual([ids[0]]);
  });
});
