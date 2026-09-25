// The scenario runner (ARCHITECTURE.md): npm run e2e is generated from the manifest's scenarios. One Playwright test
// per scenario and per door of its `doors`, on the installed Chrome: the fixture loaded through File › Open, the setup
// through doors, every step through its door with the real mouse and keyboard, then the end terminals the scenario
// names: the document diff, the selection and the history read through the read-only test port, computed style and
// geometry inside the frame, the feedback in the status bar, the editor's regions, storage after an immediate reload,
// and the refusals. A feature runs once every command it lists and its scenarios run is built (a registered
// handler); the others are
// reported as not built by the status reporter (tools/runner/status.ts), which derives each feature's status from
// the results. The tooth proof (tools/runner/tooth.ts) runs a feature's tests with its handlers, or the module it
// names, made no-ops (tools/runner/tooth-plugin.ts) and requires every one of them to fail.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EMPTY_FIXTURE, applyDiff, matchDocument, resolveNode, type DiffOp } from '../../src/manifest/scenario.ts';
import { openMenu, runDoor } from '../../tests/e2e/door.ts';

type Measure = 'x' | 'y' | 'width' | 'height';
type Relation = 'equals' | 'less-than' | 'greater-than';
interface Step {
  readonly door: string;
  readonly args: Record<string, unknown>;
  readonly target: string | null;
  readonly drop: unknown;
  readonly action: boolean;
  readonly hold?: boolean;
  readonly type?: string | null;
}
interface Scenario {
  readonly id: string;
  readonly setup: { fixture: string; selection: string[]; context: string; breakpoint: string; state: string; locale: string; viewport: string; zoom: 'fit' | number };
  readonly steps: readonly Step[];
  readonly doors: readonly string[];
  readonly expect: {
    document: DiffOp[];
    selection: string[];
    history: { undoSteps: number };
    render: {
      computed: { node: string; property: string; value: string }[];
      geometry: { node: string; measure: Measure; relation: Relation; value: number; reference: string | null }[];
      feedback: { key: string; params: Record<string, string | number> }[];
    } | null;
    editor: { regions: { region: string; measure: Measure; relation: Relation; value: number; reference: string | null }[]; computed: { region: string; property: string; value: string }[] } | null;
    persistence: { document: 'same' | null; preferences: 'same' | null } | null;
    export: unknown;
  };
  readonly refusals: { key: string }[];
}
export interface Feature {
  readonly id: string;
  readonly commands: readonly string[];
  readonly toothProof?: string;
  readonly scenarios: readonly Scenario[];
}

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
export const FEATURES: Feature[] = fs
  .readdirSync('manifest/features')
  .filter((f) => /^\d\d-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => (read(path.join('manifest/features', f)) as { features: Feature[] }).features);
const references = (read('manifest/references.json') as { references: { kind: string; id: string; status: string }[] }).references;
export const BUILT = new Set(references.filter((r) => r.kind === 'handler' && r.status === 'registered').map((r) => r.id));
const environment = read('manifest/environment.json') as { viewports: { id: string; width: number; height: number }[]; locales: { default: string } };
const COMMANDS = fs.readdirSync('manifest/commands').flatMap((f) => (read(path.join('manifest/commands', f)) as { commands: { id: string; entryPoints: { id: string; args: Record<string, unknown> }[] }[] }).commands);

// a feature runs once every command it lists, and every command its scenarios' steps and doors run, is built
const commandOf = (door: string) => door.split('#')[0] ?? '';
export const runnable = (f: Feature) =>
  f.scenarios.length > 0 && [...f.commands, ...f.scenarios.flatMap((s) => [...s.doors, ...s.steps.map((step) => step.door)].map(commandOf))].every((c) => BUILT.has(c));
export const FEATURE_TAG = (id: string) => `@feature:${id}`;

// a message's text, as the app's own i18n runtime writes it (src/i18n/index.ts, served by the dev server)
const text = (page: Page, locale: string, key: string, params: Record<string, string | number>) =>
  page.evaluate(
    async ([module, l, k, p]) => {
      const i18n = (await import(module)) as { translate: (locale: string, key: string, params: unknown) => string };
      return i18n.translate(l, k, p);
    },
    ['/src/i18n/index.ts', locale, key, params] as const,
  );

// what the read-only test port reads (src/editor/test-port.ts)
const port = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; selection: () => string[]; history: () => { undoSteps: number; redoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), selection: p.selection(), history: p.history() };
  });

const compare = (actual: number, relation: Relation, expected: number) =>
  relation === 'equals' ? Math.abs(actual - expected) <= 0.5 : relation === 'less-than' ? actual < expected : actual > expected;

// the node's id at a path of the document the port reads
function idOf(document: unknown, nodePath: string): string {
  const resolved = resolveNode(document, nodePath.split('/').filter((s) => s !== ''));
  if (typeof resolved === 'string') throw new Error(`${nodePath}: ${resolved}`);
  const id = (resolved.node as { id?: unknown }).id;
  if (typeof id !== 'string') throw new Error(`${nodePath} has no id`);
  return id;
}

async function setUp(page: Page, s: Scenario): Promise<unknown> {
  const viewport = environment.viewports.find((v) => v.id === s.setup.viewport);
  if (!viewport) throw new Error(`no viewport ${s.setup.viewport}`);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  if (s.setup.locale !== environment.locales.default) {
    const door = COMMANDS.find((c) => c.id === 'preferences.setLanguage')?.entryPoints.find((d) => d.args.locale === s.setup.locale);
    if (!door) throw new Error(`no door sets the language ${s.setup.locale}`);
    await runDoor(page, `preferences.setLanguage#${door.id}`);
  }
  if (s.setup.fixture !== EMPTY_FIXTURE) {
    // File › Open, with the browser's file chooser, as a user opens a project
    await openMenu(page, 'file');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-door="project.open#menu-file"]').click();
    await (await chooser).setFiles(path.join('manifest/features/fixtures', `${s.setup.fixture}.json`));
    const fixture = read(path.join('manifest/features/fixtures', `${s.setup.fixture}.json`));
    await expect.poll(async () => (await port(page)).document).toEqual(fixture);
  }
  // setup the runner cannot reach through a door yet fails the scenario rather than faking it
  const unsupported = [
    s.setup.selection.length > 0 ? `selection ${s.setup.selection.join(', ')}` : null,
    s.setup.context !== 'global' ? `context ${s.setup.context}` : null,
    s.setup.breakpoint !== 'desktop' ? `breakpoint ${s.setup.breakpoint}` : null,
    s.setup.state !== 'base' ? `state ${s.setup.state}` : null,
    s.setup.zoom !== 'fit' ? `zoom ${s.setup.zoom}` : null,
  ].filter((u) => u !== null);
  if (unsupported.length > 0) throw new Error(`the runner cannot set up ${unsupported.join('; ')} through doors yet`);
  return (await port(page)).document;
}

async function runStep(page: Page, step: Step, door: string) {
  if (step.target !== null || step.drop !== null || step.hold === true) throw new Error(`step ${door}: targets, drops and holds need the pointer owner`);
  await runDoor(page, door);
  if (step.type) await page.keyboard.type(step.type.replace(/\n/g, '\n'));
}

async function frameBox(page: Page, id: string) {
  return page.frameLocator('.frame__page').locator(`[data-node="${id}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

// every scenario of every feature that runs, once per door of its action step
export function registerScenarioTests(): void {
  for (const feature of FEATURES.filter(runnable)) {
    for (const s of feature.scenarios) {
      for (const door of s.doors) {
        const doorsRun = s.steps.map((step) => (step.action ? door : step.door));
        test(`${feature.id} › ${s.id} › ${door}`, { tag: FEATURE_TAG(feature.id), annotation: [{ type: 'feature', description: feature.id }, ...doorsRun.map((d) => ({ type: 'door', description: d }))] }, async ({ page }) => {
          const fixture = await setUp(page, s);
          for (const step of s.steps) await runStep(page, step, step.action ? door : step.door);
          const after = await port(page);

          // the document diff and the selection, through the test port
          const expected = applyDiff(fixture, s.expect.document);
          if ('error' in expected && expected.error) throw new Error(String(expected.error));
          expect(matchDocument(after.document, (expected as { document: unknown }).document), 'document').toEqual([]);
          expect(after.selection, 'selection').toEqual(s.expect.selection.map((p) => idOf(after.document, p)));
          expect(after.history.undoSteps, 'history: undo steps').toBe(s.expect.history.undoSteps);

          const render = s.expect.render;
          if (render) {
            for (const c of render.computed) {
              const value = await page.frameLocator('.frame__page').locator(`[data-node="${idOf(after.document, c.node)}"]`).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), c.property);
              expect(value, `${c.node} ${c.property}`).toBe(c.value);
            }
            for (const g of render.geometry) {
              const actual = (await frameBox(page, idOf(after.document, g.node)))[g.measure];
              const base = g.reference === null ? 0 : (await frameBox(page, idOf(after.document, g.reference)))[g.measure];
              expect(compare(actual, g.relation, base + g.value), `${g.node} ${g.measure} ${actual} ${g.relation} ${base + g.value}`).toBe(true);
            }
            const last = render.feedback.at(-1);
            if (render.feedback.length > 1) throw new Error('the status bar shows the last message only');
            if (last) await expect(page.getByRole('status'), 'feedback').toHaveText(await text(page, s.setup.locale, last.key, last.params));
          }

          const editor = s.expect.editor;
          if (editor) {
            const regionBox = async (id: string) => {
              const box = await page.locator(`[data-region="${id}"]`).first().boundingBox();
              if (box === null) throw new Error(`region ${id} is not laid out`);
              return box;
            };
            for (const r of editor.regions) {
              const actual = (await regionBox(r.region))[r.measure];
              const base = r.reference === null ? 0 : (await regionBox(r.reference))[r.measure];
              expect(compare(actual, r.relation, base + r.value), `${r.region} ${r.measure} ${actual} ${r.relation} ${base + r.value}`).toBe(true);
            }
            for (const c of editor.computed) {
              const value = await page.locator(`[data-region="${c.region}"]`).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), c.property);
              expect(value, `${c.region} ${c.property}`).toBe(c.value);
            }
          }

          for (const refusal of s.refusals) {
            await expect(page.getByRole('status'), 'refusal').toHaveText(await text(page, s.setup.locale, refusal.key, {}));
            expect(matchDocument(after.document, fixture), 'refused: document unchanged').toEqual([]);
          }

          // undo and redo restore the document through their doors
          if (s.expect.history.undoSteps > 0) {
            for (let i = 0; i < s.expect.history.undoSteps; i += 1) await runDoor(page, 'history.undo#toolbar-top-bar');
            expect(matchDocument((await port(page)).document, fixture), 'undo restores').toEqual([]);
            for (let i = 0; i < s.expect.history.undoSteps; i += 1) await runDoor(page, 'history.redo#toolbar-top-bar');
            expect(matchDocument((await port(page)).document, after.document), 'redo restores').toEqual([]);
          }

          const persistence = s.expect.persistence;
          if (persistence) {
            const stored = await page.evaluate(() => window.localStorage.getItem('preferences'));
            await page.reload();
            await expect(page.locator('.workbench')).toBeVisible();
            if (persistence.document === 'same') expect(matchDocument((await port(page)).document, after.document), 'document after reload').toEqual([]);
            if (persistence.preferences === 'same') expect(await page.evaluate(() => window.localStorage.getItem('preferences')), 'preferences after reload').toBe(stored);
          }
          if (s.expect.export !== null) throw new Error('the export terminal needs project-export');
        });
      }
    }
  }
}
