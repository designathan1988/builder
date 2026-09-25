// hide-element beyond its scenarios (spec/behavior/hide-element.md): the Layers eye hides the element of its own row
// and leaves the selection as it is; the hidden flag is in the document JSON, the element and its whole subtree are
// not drawn and the next sibling takes their place; a second click shows it again exactly where it was; each is one
// undo step. A hidden element is still selected from Layers and shown again from the context menu; the page root is
// refused; Element actions › Hide acts on the primary; the flag survives an immediate reload and is in the saved
// project. A row shows its Hide only under the pointer, except the row of a hidden element, whose Hide stays shown and
// pressed. The document, the selection and the history are read through the read-only test port; the page through
// the frame; the saved project through the runner's unzip.
import fs from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SAVE = 'project.save#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ROW = 'selection.select#layers-row';
const ROW_MENU = 'contextMenu.open#layers-row-secondary-click';
const EYE = 'element.toggleHidden#layers-row-eye';
const LOCK = 'element.toggleLock#layers-row-lock';
const MENU_HIDE = 'element.toggleHidden#menu-element-actions';
const CONTEXT_HIDE = 'element.toggleHidden#context-menu';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';
const CTRL_SHIFT_Z = 'history.redo#key-ctrl-shift-z-in-global';

interface Tree {
  readonly id: string;
  readonly hidden?: boolean;
  readonly children: readonly Tree[];
}
// the whole document, the ids of the hidden nodes, the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const document = p.document();
    const hidden: string[] = [];
    const visit = (n: Tree) => {
      if ('hidden' in n) hidden.push(`${n.id}=${String(n.hidden)}`);
      n.children.forEach(visit);
    };
    for (const page of document.pages) visit(page.tree);
    return { document, hidden, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const FIXTURE_DOCUMENT = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as unknown;

const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
const display = (page: Page, id: string) => drawn(page, id).evaluate((el) => getComputedStyle(el).display);
// the boxes of a node's element in page px, or null when the page draws no box for it
const box = (page: Page, id: string) =>
  drawn(page, id).evaluate((el) => {
    if (el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
const boxes = async (page: Page, ids: readonly string[]) => Promise.all(ids.map((id) => box(page, id)));
const status = (page: Page) => page.getByRole('status');

// a click on the canvas at the centre of a node's element (a leaf: the click hits the node itself)
async function clickNode(page: Page, id: string) {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  await page.mouse.click(at.x, at.y);
}

// the pointer on the status bar: over no Layers row
async function pointerAway(page: Page) {
  const bar = await status(page).boundingBox();
  if (bar === null) throw new Error('the status bar is not laid out');
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
}
const opacity = (page: Page, ref: string, target: string) => control(page, ref, { args: { target } }).evaluate((el) => getComputedStyle(el).opacity);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  // File › Open with the browser's file chooser, as a person opens a project
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
});

test('the Layers eye hides its row’s element and keeps the selection; a second click shows it exactly where it was; each is an undo step', runs(OPEN, SELECT, EYE, CTRL_Z, CTRL_SHIFT_Z), async ({ page }) => {
  await clickNode(page, 'n-title');
  expect(await read(page)).toMatchObject({ hidden: [], selection: ['n-title'], undoSteps: 0 });
  const HERO = ['n-title', 'n-intro', 'n-actions'];
  const shown = await boxes(page, HERO);

  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-intro=true']);
  expect(await read(page)).toMatchObject({ selection: ['n-title'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Hidden: Intro');
  // not drawn, still in the page; the next sibling moves up into its place
  expect(await display(page, 'n-intro')).toBe('none');
  expect(await box(page, 'n-intro')).toBeNull();
  const [title, , actions] = await boxes(page, HERO);
  expect(title).toEqual(shown[0]);
  expect(actions?.y).toBeLessThan(shown[2]?.y ?? 0);

  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual([]);
  expect(await read(page)).toMatchObject({ selection: ['n-title'], undoSteps: 2 });
  await expect(status(page)).toHaveText('Visible: Intro');
  expect(await display(page, 'n-intro')).toBe('block');
  // the layout it had, exactly
  expect(await boxes(page, HERO)).toEqual(shown);

  // undo hides it again, then shows it; redo hides it
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-intro=true']);
  expect(await display(page, 'n-intro')).toBe('none');
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).document).toEqual(FIXTURE_DOCUMENT);
  expect(await boxes(page, HERO)).toEqual(shown);
  await runDoor(page, CTRL_SHIFT_Z);
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-intro=true']);
  expect(await display(page, 'n-intro')).toBe('none');
});

test('hiding a container hides its whole subtree, and its row can still select it', runs(OPEN, SELECT, EYE, ROW), async ({ page }) => {
  await clickNode(page, 'n-title');
  const footer = await box(page, 'n-footer');
  await runDoor(page, EYE, { args: { target: 'n-plans' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-plans=true']);
  await expect(status(page)).toHaveText('Hidden: Plans');
  // no node of the subtree is drawn, and the footer moves up into the place it left
  for (const id of ['n-plans', 'n-grid', 'n-card-a', 'n-card-a-title', 'n-card-c', 'n-perks', 'n-perk-two-text']) expect(await box(page, id), `${id} is not drawn`).toBeNull();
  expect((await box(page, 'n-footer'))?.y).toBeLessThan(footer?.y ?? 0);
  // selected from Layers while hidden
  await runDoor(page, ROW, { args: { target: 'n-plans' } });
  await expect.poll(async () => (await read(page)).selection).toEqual(['n-plans']);
  expect((await read(page)).hidden).toEqual(['n-plans=true']);
});

test('the page root cannot be hidden: the status bar says why and nothing changes', runs(OPEN, ROW, EYE), async ({ page }) => {
  await runDoor(page, ROW, { args: { target: 'n-page' } });
  await expect.poll(async () => (await read(page)).selection).toEqual(['n-page']);
  await runDoor(page, EYE, { args: { target: 'n-page' } });
  await expect(status(page)).toHaveText('The page root cannot be hidden.');
  expect(await read(page)).toMatchObject({ document: FIXTURE_DOCUMENT, hidden: [], selection: ['n-page'], undoSteps: 0 });
  expect(await display(page, 'n-page')).toBe('block');
});

test('Element actions › Hide hides the selected element, and shows it again', runs(OPEN, SELECT, MENU_HIDE), async ({ page }) => {
  await clickNode(page, 'n-note');
  await runDoor(page, MENU_HIDE);
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-note=true']);
  expect(await read(page)).toMatchObject({ selection: ['n-note'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Hidden: Note');
  expect(await display(page, 'n-note')).toBe('none');
  await runDoor(page, MENU_HIDE);
  await expect.poll(async () => (await read(page)).document).toEqual(FIXTURE_DOCUMENT);
  expect((await read(page)).undoSteps).toBe(2);
  await expect(status(page)).toHaveText('Visible: Note');
  expect(await display(page, 'n-note')).toBe('block');
});

test('a hidden element is shown again from its Layers row’s context menu', runs(OPEN, SELECT, EYE, ROW_MENU, CONTEXT_HIDE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-intro=true']);
  // the canvas draws no Intro to right-click: its Layers row opens the menu, and selects it
  await runDoor(page, ROW_MENU, { args: { target: 'n-intro' } });
  await runDoor(page, CONTEXT_HIDE);
  await expect.poll(async () => (await read(page)).hidden).toEqual([]);
  expect(await read(page)).toMatchObject({ document: FIXTURE_DOCUMENT, selection: ['n-intro'], undoSteps: 2 });
  await expect(status(page)).toHaveText('Visible: Intro');
  expect(await display(page, 'n-intro')).toBe('block');
});

test('the hidden flag survives an immediate reload and is in the saved project', runs(OPEN, SELECT, EYE, SAVE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, EYE, { args: { target: 'n-card-c' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-card-c=true']);
  const hidden = (await read(page)).document;
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect((await read(page)).document).toEqual(hidden);
  await expect(drawn(page, 'n-card-c')).toHaveCount(1);
  expect(await display(page, 'n-card-c')).toBe('none');

  const download = page.waitForEvent('download');
  await runDoor(page, SAVE);
  const file: Download = await download;
  const saved = JSON.parse((unzip(fs.readFileSync(await file.path())).get('project.json') as Buffer).toString('utf8')) as unknown;
  expect(saved).toEqual(hidden);
});

test('a row shows its Hide only under the pointer; the row of a hidden element keeps it shown and pressed', runs(OPEN, SELECT, EYE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await pointerAway(page);
  expect(await opacity(page, EYE, 'n-intro')).toBe('0');
  await control(page, ROW, { args: { target: 'n-intro' } }).hover();
  expect(await opacity(page, EYE, 'n-intro')).toBe('1');
  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect.poll(async () => (await read(page)).hidden).toEqual(['n-intro=true']);
  await pointerAway(page);
  expect(await opacity(page, EYE, 'n-intro')).toBe('1');
  await expect(control(page, EYE, { args: { target: 'n-intro' } })).toHaveAttribute('aria-pressed', 'true');
  // the row's other controls stay out of sight
  expect(await opacity(page, LOCK, 'n-intro')).toBe('0');
  expect(await opacity(page, EYE, 'n-title')).toBe('0');
});

// spec, Problems in Pager 1: a hidden selected element is still shown to be there: its selection outline is drawn
// dashed on its nearest shown ancestor (the Hero, whose box the page draws), and its label says it is hidden
test('a hidden selected element is outlined, dashed, on its parent, and its label says hidden', runs(OPEN, SELECT, MENU_HIDE), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, MENU_HIDE);
  await expect.poll(() => display(page, 'n-intro')).toBe('none');
  const outline = page.locator('[data-chrome="selection"]');
  await expect(outline).toHaveCount(1);
  expect(await outline.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  // the outline covers the Hero's box on the screen
  const hero = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector('[data-node="n-hero"]');
    if (!iframe || !el) throw new Error('the canvas does not draw the Hero');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  });
  const drawnOutline = await outline.boundingBox();
  if (drawnOutline === null) throw new Error('the selection outline is not laid out');
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(drawnOutline[k] - hero[k]), `outline ${k}`).toBeLessThan(2);
  await expect(page.locator('[data-chrome="label"] .chrome__flag')).toHaveText('hidden');
  await expect(page.locator('[data-chrome="label"] .chrome__name')).toHaveText('Intro');
});
