// duplicate beyond its scenarios (spec/behavior/duplicate.md): Ctrl+D and the Edit menu's Duplicate, the doors of
// element.duplicate a user can reach before the context menu exists. A copy of every selected root goes right after
// its original with its whole subtree, texts and classes; every node of a copy gets a fresh id and a new unique name
// (spec, Problems 1); the copies become the selection; one undo step takes them away and redo brings back the same
// copies; the page root is refused. The document, the selection and the history are read through the read-only test
// port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const WALK_UP = 'selection.walkParent#key-arrow-up-in-canvas';
const ADD = 'selection.add#canvas-click-element-shift';
const KEY_DUPLICATE = 'element.duplicate#key-ctrl-d-in-global';
const MENU_DUPLICATE = 'element.duplicate#menu-edit';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';
const CTRL_SHIFT_Z = 'history.redo#key-ctrl-shift-z-in-global';

interface Tree {
  readonly id: string;
  readonly name: string;
  readonly text: string | null;
  readonly classes: readonly string[];
  readonly children: readonly Tree[];
}
// the fields of a node the tests read
type Outline = Tree;
// a node's children (id, name, text, classes and theirs), the selection and the undo steps, through the read-only test port
const read = (page: Page, parent: string) =>
  page.evaluate((id) => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const find = (n: Tree): Tree | null => (n.id === id ? n : n.children.map(find).find((f) => f !== null) ?? null);
    const outline = (n: Tree): Outline => ({ id: n.id, name: n.name, text: n.text, classes: n.classes, children: n.children.map(outline) });
    const root = p.document().pages[0]?.tree;
    const found = root === undefined ? null : find(root);
    return { children: found?.children.map(outline) ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  }, parent);
const names = (outline: readonly Outline[] | null) => outline?.map((c) => c.name) ?? null;
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

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

// the top of a node's element inside the frame, in page px
const top = (page: Page, id: string) =>
  page.evaluate((node) => {
    const el = document.querySelector<HTMLIFrameElement>('.frame__page')?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    return el.getBoundingClientRect().top;
  }, id);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('Ctrl+D copies a card with its heading after it, every node with a fresh id and a new name; one undo step, redo brings the same copy back', runs('project.open#menu-file', SELECT, WALK_UP, KEY_DUPLICATE, CTRL_Z, CTRL_SHIFT_Z), async ({ page }) => {
  await clickNode(page, 'n-card-a-title');
  await runDoor(page, WALK_UP);
  expect(await read(page, 'n-grid')).toMatchObject({ selection: ['n-card-a'], undoSteps: 0 });
  const before = await read(page, 'n-grid');

  await runDoor(page, KEY_DUPLICATE);
  await expect.poll(async () => names((await read(page, 'n-grid')).children)).toEqual(['CardA', 'CardA 2', 'CardB', 'CardC']);
  const after = await read(page, 'n-grid');
  const copy = after.children?.[1];
  if (copy === undefined) throw new Error('no copy');
  expect(copy).toMatchObject({ name: 'CardA 2', text: null, classes: ['card'], children: [{ name: 'CardATitle 2', text: 'Monthly', classes: [], children: [] }] });
  // fresh ids, none of the document's
  const title = copy.children[0];
  expect([copy.id, title?.id].filter((id) => id === undefined || id.startsWith('n-'))).toEqual([]);
  expect(title?.id).not.toBe(copy.id);
  expect(after.selection).toEqual([copy.id]);
  expect(after.undoSteps).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Duplicated CardA as CardA 2.');
  // drawn below its original, with its heading
  await expect(drawn(page, copy.id)).toHaveCount(1);
  await expect(drawn(page, title?.id ?? '')).toHaveText('Monthly');
  expect(await top(page, copy.id)).toBeGreaterThan(await top(page, 'n-card-a'));

  // one undo step takes the copy away and selects the original again
  await runDoor(page, CTRL_Z);
  await expect.poll(() => read(page, 'n-grid')).toEqual(before);
  await expect(drawn(page, copy.id)).toHaveCount(0);
  // redo brings back the same copy, ids and all
  await runDoor(page, CTRL_SHIFT_Z);
  await expect.poll(() => read(page, 'n-grid')).toEqual(after);
  await expect(drawn(page, copy.id)).toHaveCount(1);
});

test('Edit › Duplicate is disabled with its reason while nothing is selected', runs('project.open#menu-file', MENU_DUPLICATE), async ({ page }) => {
  const before = await read(page, 'n-hero');
  await openMenu(page, 'edit');
  const item = page.locator(`[data-door="${MENU_DUPLICATE}"]`);
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await expect(item).toHaveAttribute('title', /Select an element first\./);
  await item.click({ force: true });
  expect(await read(page, 'n-hero')).toEqual(before);
});

test('Edit › Duplicate duplicates the selection like Ctrl+D', runs('project.open#menu-file', SELECT, MENU_DUPLICATE), async ({ page }) => {
  await clickNode(page, 'n-intro');
  expect(await read(page, 'n-hero')).toMatchObject({ selection: ['n-intro'], undoSteps: 0 });
  await runDoor(page, MENU_DUPLICATE);
  await expect.poll(async () => names((await read(page, 'n-hero')).children)).toEqual(['Title', 'Intro', 'Intro 2', 'Actions']);
  const after = await read(page, 'n-hero');
  const copy = after.children?.[2];
  expect(copy).toMatchObject({ name: 'Intro 2', text: 'Fresh coffee, roasted every week.' });
  expect(after.selection).toEqual([copy?.id]);
  expect(after.undoSteps).toBe(1);
  await expect(drawn(page, copy?.id ?? '')).toHaveText('Fresh coffee, roasted every week.');
  await expect(page.getByRole('status')).toHaveText('Duplicated Intro as Intro 2.');
});

test('Ctrl+D copies every selected root, each after its original, in one undo step', runs('project.open#menu-file', SELECT, ADD, KEY_DUPLICATE, CTRL_Z), async ({ page }) => {
  // Actions, then Title added with Shift: two roots, the primary Actions first
  await clickNode(page, 'n-actions');
  await page.keyboard.down('Shift');
  await clickNode(page, 'n-title');
  await page.keyboard.up('Shift');
  const before = await read(page, 'n-hero');
  expect(before).toMatchObject({ selection: ['n-actions', 'n-title'], undoSteps: 0 });

  await runDoor(page, KEY_DUPLICATE);
  await expect.poll(async () => names((await read(page, 'n-hero')).children)).toEqual(['Title', 'Title 2', 'Intro', 'Actions', 'Actions 2']);
  const after = await read(page, 'n-hero');
  // the primary's copy first
  expect(after.selection).toEqual([after.children?.[4]?.id, after.children?.[1]?.id]);
  expect(after.undoSteps).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Duplicated 2 elements.');

  await runDoor(page, CTRL_Z);
  await expect.poll(() => read(page, 'n-hero')).toEqual(before);
});

test('Ctrl+D refuses the page root and changes nothing', runs('project.open#menu-file', SELECT, WALK_UP, KEY_DUPLICATE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, WALK_UP);
  await runDoor(page, WALK_UP);
  const before = await read(page, 'n-page');
  expect(before).toMatchObject({ selection: ['n-page'], undoSteps: 0 });
  await runDoor(page, KEY_DUPLICATE);
  await expect(page.getByRole('status')).toHaveText('The page root cannot be duplicated.');
  expect(await read(page, 'n-page')).toEqual(before);
});
