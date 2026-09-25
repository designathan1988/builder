// The scenario runner (ARCHITECTURE.md): npm run e2e is generated from the manifest's scenarios. One Playwright test
// per scenario and per door of its `doors`, on the installed Chrome: the fixture loaded through File › Open, the setup
// through doors (the language, the selection clicked on the canvas or, for a node its children cover whole, reached
// with ArrowUp from inside it or through its Layers row, the breakpoint, the style state, the zoom),
// every step through its door with the real mouse and keyboard (a click on the node it targets, a drag released
// where its drop says or held across the next steps, a marquee drawn from its target's empty area to its drop's node,
// the characters it types), then the end terminals the scenario
// names: the document diff, the selection and the history read through the read-only test port, computed style and
// geometry inside the frame, the feedback in the status bar, the editor's regions, storage after an immediate
// reload, and the refusals. After the setup and after the steps the canvas must draw the document the port reads;
// when it does not, the test fails on that assertion, never on a timeout.
// A feature runs once it is registered as built in the feature table (src/app/features.ts); the others are reported
// as not built by the status reporter (tools/runner/status.ts), which derives each feature's status from the results.
// A registered feature must have scenarios, every command it lists built (a registered handler) and every door its
// scenarios' setups, steps and Undo and Redo run working (`blockers`): the census fails one that does not. The tooth proof (tools/runner/tooth.ts) runs a feature's tests
// with its handlers, or the module it names, made no-ops (tools/runner/tooth-plugin.ts) and requires every one of
// them to fail on an assertion.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Download, type Page } from '@playwright/test';
import { isFeatureBuilt } from '../../src/app/features.ts';
import { shortcutRuns } from '../../src/editor/input/shortcut-rule.ts';
import { FEATURE_COMMANDS } from '../../src/generated/commands.ts';
import type { FeatureId } from '../../src/generated/ids.ts';
import { EMPTY_FIXTURE, applyDiff, matchDocument, resolveNode, type DiffOp } from '../../src/manifest/scenario.ts';
import { control, door as doorData, keys, modifiedControl, openMenu, runDoor, type Door } from '../../tests/e2e/door.ts';
import { unzip } from './unzip.ts';

type Measure = 'x' | 'y' | 'width' | 'height';
type Relation = 'equals' | 'less-than' | 'greater-than';
interface Drop {
  readonly placement: 'before' | 'after' | 'inside';
  readonly reference: string;
}
interface Step {
  readonly door: string;
  readonly args: Record<string, unknown>;
  readonly target: string | null;
  readonly drop: Drop | null;
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
    persistence: { document: 'same' | null; preferences: 'same' | null; selection?: 'same' | null } | null;
    // the files inside the archive the steps downloaded last: each holds every `present` text and no `absent` one
    export: { files: { path: string; present: string[]; absent: string[] }[] } | null;
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
const properties = read('manifest/properties.json') as { breakpoints: { id: string; base: boolean }[]; states: { id: string; pseudo: string | null }[] };
const elements = read('manifest/elements.json') as { elements: { id: string; content: string }[] };
const interactions = read('manifest/interactions.json') as {
  keyContexts: { id: string; inherits: string | null }[];
  constants: { id: string; value: unknown; source: string }[];
  gestures: { id: string; source: string; modifiers: { key: string; meaning: string }[] }[];
};
const COMMANDS = fs
  .readdirSync('manifest/commands')
  .flatMap((f) => (read(path.join('manifest/commands', f)) as { commands: { id: string; introducedBy: string; args: Record<string, { type: string }>; entryPoints: Door[] }[] }).commands);
const BASE_BREAKPOINT = properties.breakpoints.find((b) => b.base)?.id;
const BASE_STATE = properties.states.find((s) => s.pseudo === null)?.id;
const CONTENT = new Map(elements.elements.map((e) => [e.id, e.content]));
const DRAG_THRESHOLD = interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
// how far inside a child's edge the runner points to reach its escape band: half the band's floor, in screen pixels
const ESCAPE_FLOOR = interactions.constants.find((c) => c.id === 'drop.escapeBandFloor')?.value;
const EDGE_INSET = typeof ESCAPE_FLOOR === 'number' ? ESCAPE_FLOOR / 2 : 3;
const commandOf = (ref: string) => ref.split('#')[0] ?? '';
const argTypes = (ref: string) => COMMANDS.find((c) => c.id === commandOf(ref))?.args ?? {};

// the first door of a command whose own arguments set `arg` to `value` (the breakpoint tab of Tablet, the zoom item 200)
function settingDoor(command: string, arg: string, value: unknown): string {
  const found = COMMANDS.find((c) => c.id === command)?.entryPoints.find((d) => d.args[arg] === value);
  if (!found) throw new Error(`no door of ${command} sets ${arg} ${String(value)}`);
  return `${command}#${found.id}`;
}
// the canvas click that selects one node, and the one that adds a node to the selection
function canvasClick(command: string): string {
  const found = COMMANDS.find((c) => c.id === command)?.entryPoints.find((d) => d.kind === 'canvas-click' && d.button === 'primary' && d.count === 1);
  if (!found) throw new Error(`${command} has no canvas click`);
  return `${command}#${found.id}`;
}
const SELECT_DOOR = canvasClick('selection.select');
const ADD_DOOR = canvasClick('selection.add');
// the Layers row click that selects one node, and the one that adds a node to the selection (its key held)
function layersRowClick(command: string, modifier: string | null): string {
  const found = COMMANDS.find((c) => c.id === command)?.entryPoints.find((d) => d.kind === 'panel-control' && d.gesture === 'layers-row-click' && (d.modifier ?? null) === modifier);
  if (!found) throw new Error(`${command} has no Layers row click${modifier === null ? '' : ` with ${modifier}`}`);
  return `${command}#${found.id}`;
}
const ADD_ROW_DOOR = layersRowClick('selection.add', doorData(ADD_DOOR).modifier ?? null);
// The door of a canvas click's command on a node's Layers row, pressed with the same button and the same key: how a
// person reaches a node its children cover whole, which has no point of its own on the canvas (spec select-click,
// "Nested elements": the Layers panel). Null when the command has none.
function layersRowDoorOf(ref: string): string | null {
  const d = doorData(ref);
  const found = COMMANDS.find((c) => c.id === commandOf(ref))?.entryPoints.find(
    (o) => o.kind === 'panel-control' && o.panel === 'layers' && (o.modifier ?? null) === (d.modifier ?? null) && (o.button === 'secondary') === (d.button === 'secondary'),
  );
  return found ? `${commandOf(ref)}#${found.id}` : null;
}
// a command's shortcut in a key context
function shortcutIn(command: string, context: string): string {
  const found = COMMANDS.find((c) => c.id === command)?.entryPoints.find((d) => d.kind === 'shortcut' && d.context === context);
  if (!found) throw new Error(`${command} has no shortcut in ${context}`);
  return `${command}#${found.id}`;
}
// ArrowUp on the canvas: the selection's parent; Escape in Layers: the focus back to the canvas
const WALK_UP_DOOR = shortcutIn('selection.walkParent', 'canvas');
const BACK_TO_CANVAS_DOOR = shortcutIn('focus.canvas', 'layers-tree');
const UNDO_DOOR = 'history.undo#toolbar-top-bar';
const REDO_DOOR = 'history.redo#toolbar-top-bar';

// The doors a scenario's setup runs, in order: File › Open for a fixture, the language, the selection (the first node
// clicked, the others added, on the canvas; a node its children cover whole is reached through ArrowUp or its Layers
// row, which the test's annotations name once it runs, ranAlso and ranInstead), the breakpoint, the style state and
// the zoom.
function setupDoors(s: Scenario): string[] {
  const doors: string[] = [];
  if (s.setup.fixture !== EMPTY_FIXTURE) doors.push('project.open#menu-file');
  if (s.setup.locale !== environment.locales.default) doors.push(settingDoor('preferences.setLanguage', 'locale', s.setup.locale));
  s.setup.selection.forEach((_, i) => doors.push(i === 0 ? SELECT_DOOR : ADD_DOOR));
  if (s.setup.breakpoint !== BASE_BREAKPOINT) doors.push(settingDoor('view.setBreakpoint', 'breakpoint', s.setup.breakpoint));
  if (s.setup.state !== BASE_STATE) doors.push(settingDoor('view.setStyleState', 'state', s.setup.state));
  if (s.setup.zoom !== 'fit') doors.push(settingDoor('view.zoomTo', 'percent', s.setup.zoom));
  return doors;
}
// every door a test of the scenario runs through one of its action doors: the setup, the steps, and Undo and Redo,
// which prove every undo step restores the document
function doorsRun(s: Scenario, action: string): string[] {
  return [...setupDoors(s), ...s.steps.map((step) => (step.action ? action : step.door)), ...(s.expect.history.undoSteps > 0 ? [UNDO_DOOR, REDO_DOOR] : [])];
}

// a feature runs once every command it lists, and every command its scenarios' setups, steps and doors run, is built
// a door the scenario runs works: its command is built, and a shortcut runs by the keymap's own rule
const doorWorks = (ref: string) => {
  const command = COMMANDS.find((c) => c.id === commandOf(ref));
  const d = doorData(ref);
  if (command === undefined || !BUILT.has(command.id)) return false;
  return d.kind !== 'shortcut' || shortcutRuns({ command: command.id, introducedBy: command.introducedBy, feature: d.feature }, (id) => BUILT.has(id), FEATURE_COMMANDS);
};
// Whether a feature is registered as built (the feature table).
export const registered = (f: Feature) => isFeatureBuilt(f.id as FeatureId);
// Why a feature's scenarios cannot all run: it has none, a command it lists is not built, or a door they run does not
// work yet. Empty when every test of every scenario and door can run.
export function blockers(f: Feature): string[] {
  const found: string[] = [];
  if (f.scenarios.length === 0) found.push('it has no scenarios');
  for (const c of f.commands) if (!BUILT.has(c)) found.push(`its command ${c} is not built`);
  for (const s of f.scenarios) for (const d of s.doors) for (const ref of doorsRun(s, d)) if (!doorWorks(ref)) found.push(`${s.id} runs ${ref}, which does not work yet`);
  return [...new Set(found)];
}
export const runnable = (f: Feature) => registered(f) && blockers(f).length === 0;
export const FEATURE_TAG = (id: string) => `@feature:${id}`;

// the language the editor shows now (the shell writes it on the document element)
const uiLocale = (page: Page) => page.evaluate(() => document.documentElement.lang);
// the language the scenario expects after its steps (the action step run through `action`): the one the last step
// that chooses a language chooses (its door's or its own `locale`), else the setup's
function localeAfter(s: Scenario, action: string): string {
  for (const step of [...s.steps].reverse()) {
    const ref = step.action ? action : step.door;
    if (commandOf(ref) !== 'preferences.setLanguage') continue;
    const chosen = doorData(ref).args.locale ?? step.args.locale;
    if (typeof chosen === 'string') return chosen;
  }
  return s.setup.locale;
}

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

interface Node {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly children: readonly Node[];
}
// the node at a path of the document the port reads
function nodeAt(document: unknown, nodePath: string): Node {
  const resolved = resolveNode(document, nodePath.split('/').filter((s) => s !== ''));
  if (typeof resolved === 'string') throw new Error(`${nodePath}: ${resolved}`);
  const node = resolved.node as unknown as Node;
  if (typeof node.id !== 'string') throw new Error(`${nodePath} has no id`);
  return node;
}
const idOf = (document: unknown, nodePath: string) => nodeAt(document, nodePath).id;
const isRoot = (document: unknown, nodePath: string) => (resolveNode(document, nodePath.split('/').filter((s) => s !== '')) as { parent: unknown }).parent === null;

// A step's arguments as the app takes them: a node path becomes the node's id in the document now.
function resolveArgs(ref: string, args: Record<string, unknown>, document: unknown): Record<string, unknown> {
  const types = argTypes(ref);
  return Object.fromEntries(Object.entries(args).map(([name, value]) => [name, types[name]?.type === 'node' && typeof value === 'string' ? idOf(document, value) : value]));
}

// The canvas draws the document the port reads: the elements of the shown page (the first) are its nodes, in order.
async function canvasProblems(page: Page, document: unknown): Promise<string[]> {
  const pages = (document as { pages: { tree: Node }[] }).pages;
  const expected: { id: string; path: string }[] = [];
  const walk = (n: Node, at: string) => {
    expected.push({ id: n.id, path: `${at}/${n.name}` });
    for (const c of n.children) walk(c, `${at}/${n.name}`);
  };
  if (pages[0]) walk(pages[0].tree, '');
  const drawn = await page.frameLocator('.frame__page').locator('[data-node]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node')));
  const problems = expected.filter((e) => !drawn.includes(e.id)).map((e) => `${e.path} is not drawn`);
  const known = new Set(expected.map((e) => e.id));
  problems.push(...drawn.filter((id) => !known.has(id ?? '')).map((id) => `an element of no node (${id ?? ''}) is drawn`));
  if (problems.length === 0 && drawn.join() !== expected.map((e) => e.id).join()) problems.push('the elements are not in the order of the nodes');
  return problems;
}
async function expectCanvasDraws(page: Page, when: string): Promise<void> {
  const { document } = await port(page);
  await expect.poll(() => canvasProblems(page, document), { message: `${when}, the canvas draws the document the test port reads`, timeout: 5000 }).toEqual([]);
}

// the page element of a node, once the canvas draws it
async function frameElement(page: Page, id: string, nodePath: string) {
  const element = page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
  await expect(element, `the canvas draws ${nodePath}`).toHaveCount(1, { timeout: 5000 });
  return element;
}
async function frameBox(page: Page, id: string, nodePath: string) {
  return (await frameElement(page, id, nodePath)).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

interface Point {
  readonly x: number;
  readonly y: number;
}
type CanvasQuery =
  // a point that hits the node itself (not one of its children), nearest its centre or, for the press of a marquee,
  // nearest its top-left corner, where a band starts; the page root is hit wherever no element is
  | { readonly kind: 'node'; readonly id: string; readonly root: boolean; readonly near: 'centre' | 'start' }
  // where a drag is released for a drop before, after or inside the node
  | { readonly kind: 'drop'; readonly id: string; readonly placement: Drop['placement']; readonly container: boolean; readonly slot: number | null; readonly edgeInset: number };

// A screen point on the canvas, measured in the page as the pointer owner measures it (coordinates.ts): the iframe's
// content box scaled by its CSS zoom; the point must land on the canvas overlay. Or why there is none.
//  - A node: the centre when it hits the node, else the point nearest the centre on a grid over its visible box (for
//    the press of a marquee, the point of that grid nearest the box's top-left corner).
//  - A drop, by the zones of the drag specs (drag-reorder-canvas, drag-drop-inside): along the parent's flow axis a
//    leaf splits in halves; a container keeps an edge band at each end (min(8, 0.25 S) when empty,
//    min(clamp(0.25 S, 8, 32), 0.4 S) with children) and is "inside" between them, at the slot the step's index
//    gives: in the free gap between its children there, or, with no gap, over the half of the neighbouring child
//    that stands for the same slot (after the child before it, before the child after it), or, with no room there,
//    just inside the edge of a container child that stands for it (its escape band).
function canvasPoint(page: Page, query: CanvasQuery): Promise<Point | string> {
  return page.evaluate((q) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc || !(iframe.currentCSSZoom > 0)) return 'the canvas has no page';
    const zoom = iframe.currentCSSZoom;
    const box = iframe.getBoundingClientRect();
    const style = getComputedStyle(iframe);
    const left = box.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * zoom;
    const top = box.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * zoom;
    const screen = (x: number, y: number) => ({ x: left + x * zoom, y: top + y * zoom });
    const onOverlay = (p: { x: number; y: number }) => document.elementFromPoint(p.x, p.y)?.closest('.frame__overlay') != null;
    const el = doc.querySelector(`[data-node="${CSS.escape(q.id)}"]`);
    if (!el) return 'the canvas does not draw it';
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    if (q.kind === 'node') {
      const r = q.root ? { left: 0, top: 0, right: vw, bottom: vh } : el.getBoundingClientRect();
      const [x0, x1, y0, y1] = [Math.max(r.left, 0), Math.min(r.right, vw), Math.max(r.top, 0), Math.min(r.bottom, vh)];
      if (x1 - x0 < 1 || y1 - y0 < 1) return 'it is outside the visible page';
      const along = (a: number, b: number) => [0.5, 0.35, 0.65, 0.2, 0.8, 0.05, 0.95].map((f) => a + f * (b - a)).concat([a + 1.5, b - 1.5]);
      const points = along(x0, x1).flatMap((x) => along(y0, y1).map((y) => ({ x, y })));
      const [cx, cy] = q.near === 'start' ? [x0, y0] : [(x0 + x1) / 2, (y0 + y1) / 2];
      points.sort((p, o) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(o.x - cx, o.y - cy));
      for (const p of points) {
        const hit = doc.elementFromPoint(p.x, p.y);
        const itself = hit?.closest('[data-node]') === el || (q.root && hit === doc.documentElement);
        const at = screen(p.x, p.y);
        if (itself && onOverlay(at)) return at;
      }
      return 'no point of it on the canvas hits it rather than a child';
    }
    const parent = el.parentElement;
    const flow = parent ? getComputedStyle(parent) : null;
    const row = flow !== null && flow.display.includes('flex') && !flow.flexDirection.includes('column');
    const r = el.getBoundingClientRect();
    const [start, size, cross] = row ? [r.left, r.width, r.top + r.height / 2] : [r.top, r.height, r.left + r.width / 2];
    const kids = [...el.children].filter((c) => c.hasAttribute('data-node'));
    const band = !q.container ? size / 2 : kids.length === 0 ? Math.min(8, 0.25 * size) : Math.min(Math.max(8, Math.min(0.25 * size, 32)), 0.4 * size);
    let along: number;
    if (q.placement === 'before') along = start + band / 2;
    else if (q.placement === 'after') along = start + size - band / 2;
    else if (!q.container) return 'a leaf takes nothing inside';
    else if (kids.length === 0) along = start + size / 2;
    else {
      const slot = q.slot ?? kids.length;
      const edges = kids.map((k) => {
        const b = k.getBoundingClientRect();
        return row ? [b.left, b.right] : [b.top, b.bottom];
      });
      const from = slot === 0 ? start + band : (edges[slot - 1]?.[1] ?? start + band);
      const to = slot >= kids.length ? start + size - band : (edges[slot]?.[0] ?? start + size - band);
      if (to - from >= 1) along = (from + to) / 2;
      else {
        // no free gap at the slot: the spec's other way to it (drag-drop-inside, "Hit zones"): over a child, its
        // halves are before or after it, so the slot is also the second half of the child before it or the first
        // half of the child after it, between the container's own bands
        const centre = (e: number[] | undefined) => (e === undefined ? undefined : ((e[0] ?? 0) + (e[1] ?? 0)) / 2);
        const low = Math.max(start + band, slot === 0 ? start + band : (centre(edges[slot - 1]) ?? start + band));
        const high = Math.min(start + size - band, slot >= kids.length ? start + size - band : (centre(edges[slot]) ?? start + size - band));
        // with no room there either: a child that is a container stands for the slot at its own edge, where its
        // escape band (the innermost of the ladder over whatever lies under the pointer inside it, or its own edge
        // band) puts the drop before or after it: just inside the leading edge of the child after the slot, or the
        // trailing edge of the last child (drag-reorder-canvas, "Hit zones": the escape ladder)
        const next = kids[slot];
        const last = kids.at(-1);
        const inset = q.edgeInset / zoom;
        if (high - low >= 1) along = (low + high) / 2;
        else if (next?.hasAttribute('data-container') === true && edges[slot] !== undefined) along = (edges[slot]?.[0] ?? 0) + inset;
        else if (slot >= kids.length && last?.hasAttribute('data-container') === true && edges.at(-1) !== undefined) along = (edges.at(-1)?.[1] ?? 0) - inset;
        else return `no room inside it at slot ${slot}, between its children, over their halves nor at a container child's edge`;
      }
    }
    const at = row ? screen(along, cross) : screen(cross, along);
    return onOverlay(at) ? at : 'the drop point is not on the canvas';
  }, query);
}

// canvasPoint's answer for a node its children cover whole (the same text as in the page script above)
const NO_OWN_POINT = 'no point of it on the canvas hits it rather than a child';

// The doors a test names are listed before it runs (Playwright's list, which the door census reads), where the canvas
// cannot be measured: a setup names the canvas click, its first choice. When the setup reaches a node another way,
// the test's own annotations say so from then on (its results, the status reporter).
function ranAlso(ran: string) {
  test.info().annotations.push({ type: 'door', description: ran });
}
function ranInstead(listed: string, ran: string) {
  const annotations = test.info().annotations;
  const at = annotations.findIndex((a) => a.type === 'door' && a.description === listed);
  if (at >= 0) annotations.splice(at, 1, { type: 'door', description: ran });
  else ranAlso(ran);
}

// Where an element's drag is pressed: a point of its own, unless every point of its own is the marquee's (a container
// with children, whose empty area the marquee door's zone "page-or-container" takes, spec marquee-select); then its
// name label on the canvas, which shows once the element is selected: clicked first when it is not, as a person
// would (spec select-click, "Hit zones": the element's selection label selects or drags the element it names).
const MARQUEE_DOOR = COMMANDS.flatMap((c) => c.entryPoints).find((d) => d.kind === 'canvas-drag' && d.source === 'empty-area');
async function elementDragPoint(page: Page, document: unknown, nodePath: string): Promise<Point> {
  const node = nodeAt(document, nodePath);
  const own = await nodePoint(page, node.id, isRoot(document, nodePath), nodePath);
  const marqueeArea = MARQUEE_DOOR?.zone === 'page-or-container' && CONTENT.get(node.type) === 'children' && node.children.length > 0;
  if (!marqueeArea) return own;
  const { selection } = await port(page);
  if (selection.length !== 1 || selection[0] !== node.id) {
    await withModifier(page, doorData(SELECT_DOOR).modifier, () => page.mouse.click(own.x, own.y));
    ranAlso(SELECT_DOOR);
  }
  const label = page.locator(`[data-chrome="label"][data-label-for="${node.id}"]`);
  await expect(label, `${nodePath}: its label shows on the canvas once it is selected`).toBeVisible({ timeout: 5000 });
  const box = await label.boundingBox();
  if (box === null) throw new Error(`${nodePath}: its label is not laid out`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// the nearest node inside a node its children cover whole that has a point of its own on the canvas (depth first, in
// the children's order), and how many levels below the node it sits; null when there is none
async function ownPointBelow(page: Page, node: Node, levels: number): Promise<{ readonly point: Point; readonly levels: number } | null> {
  for (const child of node.children) {
    const at = await canvasPoint(page, { kind: 'node', id: child.id, root: false, near: 'centre' });
    if (typeof at !== 'string') return { point: at, levels };
    if (at !== NO_OWN_POINT) continue;
    const deeper = await ownPointBelow(page, child, levels + 1);
    if (deeper !== null) return deeper;
  }
  return null;
}

async function nodePoint(page: Page, id: string, root: boolean, nodePath: string, near: 'centre' | 'start' = 'centre'): Promise<Point> {
  await frameElement(page, id, nodePath);
  const found = await canvasPoint(page, { kind: 'node', id, root, near });
  if (typeof found === 'string') throw new Error(`${nodePath}: ${found}`);
  return found;
}

// A screen point of the stage outside the page: in the gap around the frame, where the stage itself is hit.
async function stagePoint(page: Page): Promise<Point> {
  const found = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const frame = document.querySelector('.frame');
    if (!stage || !frame) return 'the canvas has no stage';
    const s = stage.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const candidates = [
      { x: (s.left + f.left) / 2, y: f.top + f.height / 2 },
      { x: (f.right + s.right) / 2, y: f.top + f.height / 2 },
      { x: f.left + f.width / 2, y: (f.bottom + s.bottom) / 2 },
      { x: s.left + 2, y: s.bottom - 2 },
    ];
    return candidates.find((p) => document.elementFromPoint(p.x, p.y) === stage) ?? 'no point of the stage lies outside the page';
  });
  if (typeof found === 'string') throw new Error(found);
  return found;
}

// A screen point of a drawn control: at a fraction of its height (a Layers row's zones), across its middle.
async function controlPoint(page: Page, ref: string, args: Record<string, unknown>, at = 0.5): Promise<Point> {
  const target = control(page, ref, { args });
  await expect(target, `${ref} ${JSON.stringify(args)} is drawn`).toHaveCount(1, { timeout: 5000 });
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error(`${ref} ${JSON.stringify(args)} is not laid out`);
  return { x: box.x + box.width / 2, y: box.y + box.height * at };
}

async function canvasDropPoint(page: Page, document: unknown, drop: Drop, index: number | null): Promise<Point> {
  const reference = nodeAt(document, drop.reference);
  await frameElement(page, reference.id, drop.reference);
  const found = await canvasPoint(page, { kind: 'drop', id: reference.id, placement: drop.placement, container: CONTENT.get(reference.type) === 'children', slot: index, edgeInset: EDGE_INSET });
  if (typeof found === 'string') throw new Error(`drop ${drop.placement} ${drop.reference}: ${found}`);
  return found;
}

// Where a marquee's band ends (a drag from the empty area): inside its reference, on the point nearest the
// reference's centre that hits it rather than a child, so the band runs from the press to there.
async function marqueeEndPoint(page: Page, document: unknown, drop: Drop): Promise<Point> {
  if (drop.placement !== 'inside') throw new Error(`a marquee ends inside a node, not ${drop.placement} ${drop.reference}`);
  return nodePoint(page, nodeAt(document, drop.reference).id, isRoot(document, drop.reference), drop.reference);
}

// The Layers row of a node and where on it a drop lands (layers-drag): a container row is "inside" in its middle
// half, a leaf row splits in halves.
const LAYERS_ROW = COMMANDS.find((c) => c.id === 'selection.select')?.entryPoints.find((d) => d.kind === 'panel-control' && d.gesture === 'layers-row-click');
const layersRowRef = `selection.select#${LAYERS_ROW?.id ?? ''}`;
async function layersDropPoint(page: Page, document: unknown, drop: Drop): Promise<Point> {
  const reference = nodeAt(document, drop.reference);
  const container = CONTENT.get(reference.type) === 'children';
  const at = drop.placement === 'inside' ? 0.5 : drop.placement === 'before' ? (container ? 0.125 : 0.25) : container ? 0.875 : 0.75;
  return controlPoint(page, layersRowRef, { target: reference.id }, at);
}

// The tile a palette drag is pressed on (palette-drag-insert): the door of the same command drawn as a palette tile,
// whose control stands for the step's entry.
function paletteTileDoor(ref: string): string {
  const found = COMMANDS.find((c) => c.id === commandOf(ref))?.entryPoints.find((d) => d.kind === 'panel-control' && d.control === 'tile');
  if (!found) throw new Error(`step ${ref}: its command has no palette tile to press`);
  return `${commandOf(ref)}#${found.id}`;
}

const MODIFIER_KEY: Record<string, string> = { Ctrl: 'Control', Shift: 'Shift', Alt: 'Alt', Meta: 'Meta' };
async function withModifier(page: Page, modifier: string | null | undefined, act: () => Promise<void>) {
  const key = modifier ? MODIFIER_KEY[modifier] : undefined;
  if (key) await page.keyboard.down(key);
  await act();
  if (key) await page.keyboard.up(key);
}

// the key context of the text edited in place on the canvas (interactions.json), which the edited element names
const EDIT_CONTEXT = 'text-editing';
// the key context of the keyboard's hand (interactions.json): while it holds an element, the canvas's keys are its
// own (keymap.ts), and the canvas draws its aim as a drop (spec hand-keyboard-move)
const HAND_CONTEXT = 'hand';

// the focused key context and the contexts it inherits (keymap.ts): the text edited in place names its own, a field
// keeps its keys, a region names its context, the page body is the canvas's
async function focusedContexts(page: Page): Promise<string[]> {
  const named = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'canvas';
    // the focus inside the canvas frame: the edited element (marked by the renderer) or the frame's page
    if (el instanceof HTMLIFrameElement) {
      const inner = el.contentDocument?.activeElement;
      const view = el.contentWindow as (Window & typeof globalThis) | null;
      if (inner && view && inner instanceof view.HTMLElement && inner.isContentEditable) return inner.getAttribute('data-key-context') ?? 'field';
      return 'canvas';
    }
    if (el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return 'field';
    return el.closest('[data-key-context]')?.getAttribute('data-key-context') ?? 'global';
  });
  const chain: string[] = [];
  for (let at: string | null | undefined = named; at; at = interactions.keyContexts.find((c) => c.id === at)?.inherits) chain.push(at);
  return chain;
}

// Brings the keyboard focus onto the control a shortcut acts on (the palette tile its Enter inserts), with Tab as a
// person would, when the step names what it acts on: the drawn door of the same command that stands for those
// arguments.
async function focusControlFor(page: Page, ref: string, args: Record<string, unknown>) {
  const command = commandOf(ref);
  const drawn = COMMANDS.find((c) => c.id === command)?.entryPoints.map((d) => `${command}#${d.id}`) ?? [];
  const candidates = [];
  for (const other of drawn) if ((await control(page, other, { args }).count()) === 1) candidates.push(control(page, other, { args }));
  const target = candidates[0];
  if (candidates.length !== 1 || target === undefined) throw new Error(`${ref}: ${candidates.length} controls of ${command} stand for ${JSON.stringify(args)}, not one`);
  const focused = () => target.evaluate((el) => el === document.activeElement);
  for (let i = 0; i < 400 && !(await focused()); i += 1) await page.keyboard.press('Tab');
  expect(await focused(), `${ref}: Tab reaches the control of ${JSON.stringify(args)}`).toBe(true);
}

// A drag held across steps: its door, and whether the drag's Escape (drag.cancel in the drag key context) ended it in
// the app while the button stays down; the person lets go of it once the steps are over, and that release must drop
// nothing (spec drag-level-keys-escape, palette-drag-insert).
interface Held {
  readonly door: string;
  readonly cancelled?: boolean;
}
const CANCEL_DOOR = shortcutIn('drag.cancel', 'drag');

// A step that only leads to the action (not the door the scenario proves) clicking a node its children cover whole
// runs its command's door on the node's Layers row instead, as a person would, and the test's annotations say so
// (ranInstead); the action step's own door is never replaced.
async function rowInsteadOfCanvas(page: Page, ref: string, document: unknown, nodePath: string, action: boolean): Promise<boolean> {
  const node = nodeAt(document, nodePath);
  await frameElement(page, node.id, nodePath);
  const at = await canvasPoint(page, { kind: 'node', id: node.id, root: isRoot(document, nodePath), near: 'centre' });
  const row = layersRowDoorOf(ref);
  if (action || at !== NO_OWN_POINT || row === null) return false;
  await runDoor(page, row, { args: { target: node.id } });
  ranInstead(ref, row);
  return true;
}

async function runStep(page: Page, step: Step, ref: string, held: { current: Held | null }, action = false) {
  const d = doorData(ref);
  // a key of the text edited in place needs the focus in the edited text, before anything else of the step
  if (d.kind === 'shortcut' && d.context === EDIT_CONTEXT) expect((await focusedContexts(page))[0], `step ${ref}: the focus is in the text edited in place`).toBe(EDIT_CONTEXT);
  // a key of the hand needs the focus on the canvas and an element in the hand, whose aim the canvas draws as a drop
  if (d.kind === 'shortcut' && d.context === HAND_CONTEXT) {
    expect((await focusedContexts(page))[0], `step ${ref}: the focus is on the canvas`).toBe('canvas');
    await expect(page.locator('[data-chrome="drop"]'), `step ${ref}: the hand holds an element (the canvas draws its aim)`).toHaveCount(1);
  }
  const { document } = await port(page);
  const args = resolveArgs(ref, step.args, document);
  // the arguments a drawn control stands for, beyond those its door fixes
  const own = Object.fromEntries(Object.entries(args).filter(([name]) => !(name in d.args)));
  const target = step.target === null ? null : nodeAt(document, step.target);

  if (d.kind === 'canvas-click' && d.target !== 'stage-outside-page' && step.target !== null && (await rowInsteadOfCanvas(page, ref, document, step.target, action))) {
    // reached through the node's Layers row
  } else if (d.kind === 'canvas-click') {
    if (step.hold === true || step.drop !== null) throw new Error(`step ${ref}: a click neither drops nor holds`);
    const at =
      d.target === 'stage-outside-page'
        ? await stagePoint(page)
        : target !== null && step.target !== null
          ? await nodePoint(page, target.id, isRoot(document, step.target), step.target)
          : null;
    if (at === null) throw new Error(`step ${ref}: a click on ${d.target ?? 'the canvas'} needs a target`);
    const button = d.button === 'secondary' ? 'right' : 'left';
    await withModifier(page, d.modifier, () => (d.count === 2 ? page.mouse.dblclick(at.x, at.y, { button }) : page.mouse.click(at.x, at.y, { button })));
  } else if (d.kind === 'canvas-drag' || d.kind === 'layers-drag') {
    if (held.current !== null && held.current.door === ref && step.target === null && step.drop === null && step.hold !== true) {
      // the release of the held drag, where the pointer is
      await page.mouse.up();
      held.current = null;
    } else if (held.current !== null) {
      // a door acting during the held drag: the pointer rests on the row it names for the dwell its gesture waits
      if (step.target === null || !d.zone?.endsWith('dwell')) throw new Error(`step ${ref}: a drag is held; only its release or a dwell may follow`);
      const gesture = interactions.gestures.find((g) => g.id === d.gesture);
      const dwell = interactions.constants.find((c) => c.id.toLowerCase().includes('dwell') && c.source === gesture?.source)?.value;
      if (typeof dwell !== 'number') throw new Error(`step ${ref}: no dwell constant for gesture ${d.gesture ?? ''}`);
      const on = await controlPoint(page, layersRowRef, { target: target?.id });
      await page.mouse.move(on.x, on.y, { steps: 4 });
      await page.waitForTimeout(dwell + 150);
    } else {
      if (step.drop === null) throw new Error(`step ${ref}: a drag names its drop`);
      const from =
        d.source === 'palette-tile'
          ? await controlPoint(page, paletteTileDoor(ref), { entry: args.entry })
          : d.source === 'layers-row' && target !== null
            ? await controlPoint(page, layersRowRef, { target: target.id })
            : target !== null && step.target !== null && d.source === 'canvas-element'
              ? await elementDragPoint(page, document, step.target)
              : target !== null && step.target !== null && d.source === 'empty-area'
                ? await nodePoint(page, target.id, isRoot(document, step.target), step.target, 'start')
                : null;
      if (from === null) throw new Error(`step ${ref}: the runner cannot press a ${d.source ?? ''} source`);
      const to =
        d.kind === 'layers-drag'
          ? await layersDropPoint(page, document, step.drop)
          : d.source === 'empty-area'
            ? await marqueeEndPoint(page, document, step.drop)
            : await canvasDropPoint(page, document, step.drop, typeof step.args.index === 'number' ? step.args.index : null);
      // a gesture's modifier stands for the mode the step asks (the marquee's Shift adds to the selection)
      const gesture = interactions.gestures.find((g) => g.id === d.gesture);
      const mode = typeof step.args.mode === 'string' ? step.args.mode : null;
      const modifier = mode === null ? null : (gesture?.modifiers.find((m) => m.meaning.startsWith(`${mode}-`))?.key ?? null);
      const threshold = typeof DRAG_THRESHOLD === 'number' ? DRAG_THRESHOLD : 4;
      await page.mouse.move(from.x, from.y);
      const key = modifier ? MODIFIER_KEY[modifier] : undefined;
      if (key) await page.keyboard.down(key);
      await page.mouse.down();
      await page.mouse.move(from.x + threshold + 2, from.y + threshold + 2, { steps: 3 });
      await page.mouse.move(to.x, to.y, { steps: 12 });
      if (step.hold === true) held.current = { door: ref };
      else await page.mouse.up();
      if (key) await page.keyboard.up(key);
    }
  } else if (d.kind === 'shortcut') {
    // a key of the text edited in place (the focus there was asserted above) acts on the edit: its arguments (the
    // node, the text) are what the edit holds, which the document diff checks; no control stands for them. A key of
    // the hand (asserted above too) acts at the hand's aim: its arguments (Enter: element.moveTo's parent and index)
    // are where the steps before it aimed, which the document diff checks as well
    if (d.context !== EDIT_CONTEXT && d.context !== HAND_CONTEXT && Object.keys(own).length > 0) {
      await focusControlFor(page, ref, own);
      // the control the key acts on lies in the door's key context (a palette tile in the palette's)
      const chain = await focusedContexts(page);
      if (d.context !== undefined && !chain.includes(d.context)) throw new Error(`step ${ref}: the focus is in ${chain[0] ?? 'nothing'}, the door waits in ${d.context}`);
    }
    if (d.chord === undefined) throw new Error(`shortcut ${ref} has no chord`);
    await page.keyboard.press(keys(d.chord));
    if (held.current !== null && ref === CANCEL_DOOR) held.current = { ...held.current, cancelled: true };
  } else if (d.kind === 'toolbar' || d.kind === 'menu' || d.kind === 'panel-control' || d.kind === 'context-menu') {
    // a control drawn only in some states (the toast's Undo after a delete, an item of the open context menu) fails the
    // step on an assertion that says it is not drawn, never on the click's timeout. The control is the one runDoor
    // clicks: a panel control's door with a key held (a Layers row's Shift+click) or pressed with the secondary button
    // (its secondary click) is its plain control clicked that way (modifiedControl).
    const clicked = modifiedControl(ref)?.drawn ?? ref;
    if (d.kind === 'toolbar' || d.kind === 'panel-control' || d.kind === 'context-menu') await expect(control(page, clicked, { args: own }), `step ${ref}: its control is drawn`).toBeVisible();
    await runDoor(page, ref, { args: own });
  } else {
    throw new Error(`step ${ref}: the runner cannot run a ${d.kind} door yet`);
  }
  // the characters the step types with the real keyboard ("\n" is Enter)
  if (typeof step.type === 'string') await page.keyboard.type(step.type);
}

async function setUp(page: Page, s: Scenario): Promise<unknown> {
  const viewport = environment.viewports.find((v) => v.id === s.setup.viewport);
  if (!viewport) throw new Error(`no viewport ${s.setup.viewport}`);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  if (s.setup.locale !== environment.locales.default) await runDoor(page, settingDoor('preferences.setLanguage', 'locale', s.setup.locale));
  // the editor shows the setup's language, whether a door switched it or it is the default
  await expect.poll(() => uiLocale(page), { message: `setup locale ${s.setup.locale}` }).toBe(s.setup.locale);
  if (s.setup.fixture !== EMPTY_FIXTURE) {
    // File › Open, with the browser's file chooser, as a user opens a project
    await openMenu(page, 'file');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-door="project.open#menu-file"]').click();
    await (await chooser).setFiles(path.join('manifest/features/fixtures', `${s.setup.fixture}.json`));
    const fixture = read(path.join('manifest/features/fixtures', `${s.setup.fixture}.json`));
    await expect.poll(async () => (await port(page)).document, { message: `File › Open loads ${s.setup.fixture}` }).toEqual(fixture);
  }
  await expectCanvasDraws(page, s.setup.fixture === EMPTY_FIXTURE ? 'at the start' : 'after File › Open');
  const loaded = (await port(page)).document;
  // the selection, clicked on the canvas as a person selects: the first node, then each other added. A node its
  // children cover whole has no point of its own on the canvas; a person reaches it another way (spec select-click,
  // "Nested elements": its padding, the breadcrumb, ArrowUp or the Layers panel). The first node: a click on its
  // nearest descendant that has a point of its own, then ArrowUp once per level, which leaves the focus on the canvas.
  // A node added: its Layers row with the key held, then Escape, which gives the focus back to the canvas.
  for (const [i, nodePath] of s.setup.selection.entries()) {
    const node = nodeAt(loaded, nodePath);
    await frameElement(page, node.id, nodePath);
    const at = await canvasPoint(page, { kind: 'node', id: node.id, root: isRoot(loaded, nodePath), near: 'centre' });
    const door = i === 0 ? SELECT_DOOR : ADD_DOOR;
    if (typeof at !== 'string') {
      await withModifier(page, doorData(door).modifier, () => page.mouse.click(at.x, at.y));
      continue;
    }
    if (at !== NO_OWN_POINT) throw new Error(`${nodePath}: ${at}`);
    if (i === 0) {
      const below = await ownPointBelow(page, node, 1);
      if (below === null) throw new Error(`${nodePath}: neither it nor any node inside it has a point of its own on the canvas`);
      await page.mouse.click(below.point.x, below.point.y);
      for (let level = 0; level < below.levels; level += 1) await runDoor(page, WALK_UP_DOOR);
      ranAlso(WALK_UP_DOOR);
    } else {
      await runDoor(page, ADD_ROW_DOOR, { args: { target: node.id } });
      ranInstead(door, ADD_ROW_DOOR);
      if (!doorWorks(BACK_TO_CANVAS_DOOR)) throw new Error(`${nodePath}: added through its Layers row, the focus stays there until ${BACK_TO_CANVAS_DOOR} is built`);
      await runDoor(page, BACK_TO_CANVAS_DOOR);
      ranAlso(BACK_TO_CANVAS_DOOR);
    }
  }
  expect((await port(page)).selection, 'setup: the selection').toEqual(s.setup.selection.map((p) => idOf(loaded, p)));
  for (const [command, arg, value, base] of [
    ['view.setBreakpoint', 'breakpoint', s.setup.breakpoint, BASE_BREAKPOINT],
    ['view.setStyleState', 'state', s.setup.state, BASE_STATE],
    ['view.zoomTo', 'percent', s.setup.zoom, 'fit'],
  ] as const) {
    if (value !== base) await runDoor(page, settingDoor(command, arg, value));
  }
  // the global context: no control holds the focus
  if (s.setup.context !== 'global') throw new Error(`setup context ${s.setup.context}: no door brings the focus there yet`);
  expect(await page.evaluate(() => document.activeElement === null || document.activeElement === document.body), 'setup context global: no control holds the focus').toBe(true);
  return loaded;
}

// every scenario of every feature that runs, once per door of its action step
export function registerScenarioTests(): void {
  for (const feature of FEATURES.filter(runnable)) {
    for (const s of feature.scenarios) {
      for (const door of s.doors) {
        test(`${feature.id} › ${s.id} › ${door}`, { tag: FEATURE_TAG(feature.id), annotation: [{ type: 'feature', description: feature.id }, ...doorsRun(s, door).map((d) => ({ type: 'door', description: d }))] }, async ({ page }) => {
          // every file the editor hands out during the test, as the browser downloads it (the export terminal)
          const downloads: Download[] = [];
          page.on('download', (d) => downloads.push(d));
          const fixture = await setUp(page, s);
          const held = { current: null as Held | null };
          // the document just before the (last) action step: a refused action leaves it as it was
          let beforeAction: unknown = fixture;
          for (const step of s.steps) {
            if (step.action) beforeAction = (await port(page)).document;
            await runStep(page, step, step.action ? door : step.door, held, step.action);
          }
          // a drag its Escape cancelled is let go where the pointer is; any other drag still held is a scenario's error
          if (held.current?.cancelled === true) {
            await page.mouse.up();
            held.current = null;
          }
          if (held.current !== null) throw new Error(`the drag of ${held.current.door} is still held after the last step`);
          const after = await port(page);
          await expectCanvasDraws(page, 'after the steps');

          // the document diff and the selection, through the test port
          const expected = applyDiff(fixture, s.expect.document);
          if ('error' in expected && expected.error) throw new Error(String(expected.error));
          expect(matchDocument(after.document, (expected as { document: unknown }).document), 'document').toEqual([]);
          expect(after.selection, 'selection').toEqual(s.expect.selection.map((p) => idOf(after.document, p)));
          expect(after.history.undoSteps, 'history: undo steps').toBe(s.expect.history.undoSteps);

          const render = s.expect.render;
          if (render) {
            for (const c of render.computed) {
              const value = await (await frameElement(page, idOf(after.document, c.node), c.node)).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), c.property);
              expect(value, `${c.node} ${c.property}`).toBe(c.value);
            }
            for (const g of render.geometry) {
              const actual = (await frameBox(page, idOf(after.document, g.node), g.node))[g.measure];
              const base = g.reference === null ? 0 : (await frameBox(page, idOf(after.document, g.reference), g.reference))[g.measure];
              expect(compare(actual, g.relation, base + g.value), `${g.node} ${g.measure} ${actual} ${g.relation} ${base + g.value}`).toBe(true);
            }
            const last = render.feedback.at(-1);
            if (render.feedback.length > 1) throw new Error('the status bar shows the last message only');
            // in the language the scenario expects after its steps: a step may choose one (ui-language)
            if (last) await expect(page.getByRole('status'), 'feedback').toHaveText(await text(page, localeAfter(s, door), last.key, last.params));
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

          // the files inside the archive the steps downloaded last (File › Save project, the export), read as any unzip
          // tool reads them
          const exported = s.expect.export;
          if (exported !== null) {
            await expect.poll(() => downloads.length, 'a file was downloaded').toBeGreaterThan(0);
            const saved = await (downloads.at(-1) as Download).path();
            const files = unzip(fs.readFileSync(saved));
            for (const f of exported.files) {
              const data = files.get(f.path);
              expect(data === undefined ? null : f.path, `the archive holds ${f.path} (it holds ${[...files.keys()].join(', ')})`).toBe(f.path);
              const text = (data as Buffer).toString('utf8');
              for (const p of f.present) expect(text, `${f.path} holds ${p}`).toContain(p);
              for (const a of f.absent) expect(text, `${f.path} does not hold ${a}`).not.toContain(a);
            }
          }

          // a refusal names its key; the words it fills in ("No next sibling in {parent}.") are those of the feedback
          // of the same key
          for (const refusal of s.refusals) {
            const params = render?.feedback.find((f) => f.key === refusal.key)?.params ?? {};
            await expect(page.getByRole('status'), 'refusal').toHaveText(await text(page, localeAfter(s, door), refusal.key, params));
            expect(matchDocument(after.document, beforeAction), 'refused: the refused step leaves the document unchanged').toEqual([]);
          }

          // undo and redo restore the document through their doors
          if (s.expect.history.undoSteps > 0) {
            for (let i = 0; i < s.expect.history.undoSteps; i += 1) await runDoor(page, UNDO_DOOR);
            expect(matchDocument((await port(page)).document, fixture), 'undo restores').toEqual([]);
            for (let i = 0; i < s.expect.history.undoSteps; i += 1) await runDoor(page, REDO_DOOR);
            expect(matchDocument((await port(page)).document, after.document), 'redo restores').toEqual([]);
          }

          const persistence = s.expect.persistence;
          if (persistence) {
            const stored = await page.evaluate(() => window.localStorage.getItem('preferences'));
            await page.reload();
            await expect(page.locator('.workbench')).toBeVisible();
            if (persistence.document === 'same') expect(matchDocument((await port(page)).document, after.document), 'document after reload').toEqual([]);
            if (persistence.preferences === 'same') expect(await page.evaluate(() => window.localStorage.getItem('preferences')), 'preferences after reload').toBe(stored);
            if (persistence.selection === 'same') expect((await port(page)).selection, 'selection after reload').toEqual(after.selection);
          }
        });
      }
    }
  }
}
