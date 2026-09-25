// lock-element beyond its scenarios (spec/behavior/lock-element.md): the Layers row's lock locks the element of its own
// row and leaves the selection as it is; the flag is in the document JSON; the row keeps its lock shown and pressed; a
// second click unlocks; each is one undo step. A locked element can still be selected, but every built command that
// would change it refuses it and the status bar says what to unlock (spec, Problems in Pager 1 and 3): Delete, the
// move keys, R, C, Ctrl+D, P, Arrange › Remove wrapper, a palette tile into it, a drag of it or into it, Enter and a
// double-click on its text; inside a locked element the same keys, and the Hide and Lock of the rows inside it, name
// the lock (status.locked.byAncestor). Ctrl+A leaves a locked sibling out and counts it. The page root cannot be
// locked. The flag survives an immediate reload and is in the saved project. The document, the selection and the
// history are read through the read-only test port; the page through the frame; the saved project through the
// runner's unzip.
import fs from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { unzip } from '../../tools/runner/unzip.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SAVE = 'project.save#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ROW = 'selection.select#layers-row';
const WALK_UP = 'selection.walkParent#key-arrow-up-in-canvas';
const SELECT_ALL = 'selection.selectAllInContainer#key-ctrl-a-in-canvas';
const CONTEXT_OPEN = 'contextMenu.open#canvas-right-click-element-or-page';
const LOCK = 'element.toggleLock#layers-row-lock';
const MENU_LOCK = 'element.toggleLock#menu-element-actions';
const CONTEXT_LOCK = 'element.toggleLock#context-menu';
const EYE = 'element.toggleHidden#layers-row-eye';
const DELETE = 'element.delete#key-delete-in-canvas';
const MOVE_UP = 'element.moveUp#key-alt-arrow-up-in-canvas';
const MOVE_DOWN = 'element.moveDown#key-alt-arrow-down-in-canvas';
const WRAP_ROW = 'element.wrapRow#key-r-in-canvas';
const WRAP_COLUMN = 'element.wrapColumn#key-c-in-canvas';
const DUPLICATE = 'element.duplicate#key-ctrl-d-in-global';
const NEST = 'element.nestIntoPrevious#key-alt-arrow-right-in-canvas';
const PROMOTE = 'element.promote#key-p-in-canvas';
const UNWRAP = 'element.unwrap#menu-arrange';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const DRAG_INSIDE = 'element.moveTo#canvas-drag-canvas-element-inside';
const EDIT_DOUBLE_CLICK = 'text.startEdit#canvas-double-click-text-element';
const EDIT_ENTER = 'text.startEdit#key-enter-in-canvas';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';
const CTRL_SHIFT_Z = 'history.redo#key-ctrl-shift-z-in-global';

const interactions = JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: unknown }[] };
const THRESHOLD = interactions.constants.find((c) => c.id === 'drag.threshold')?.value as number;

interface Tree {
  readonly id: string;
  readonly locked?: boolean;
  readonly children: readonly Tree[];
}
// the whole document, the nodes that carry a lock flag, the selection and the undo steps, through the read-only port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const document = p.document();
    const locked: string[] = [];
    const visit = (n: Tree) => {
      if ('locked' in n) locked.push(`${n.id}=${String(n.locked)}`);
      n.children.forEach(visit);
    };
    for (const page of document.pages) visit(page.tree);
    return { document, locked, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const locks = async (page: Page) => (await read(page)).locked;
const selection = async (page: Page) => (await read(page)).selection;
async function childrenOf(page: Page, id: string): Promise<string[]> {
  const find = (n: Tree): Tree | undefined => (n.id === id ? n : n.children.map(find).find((x) => x !== undefined));
  const tree = (await read(page)).document.pages[0]?.tree;
  return (tree === undefined ? undefined : find(tree))?.children.map((c) => c.id) ?? [];
}
const FIXTURE_DOCUMENT = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as unknown;

const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
const status = (page: Page) => page.getByRole('status');

// the centre of a node's element on the screen, through the frame's CSS zoom
function centreOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
}
// a click on the canvas at the centre of a node's element (a leaf, or an empty container: the click hits the node)
async function clickNode(page: Page, id: string, button: 'left' | 'right' = 'left') {
  const at = await centreOf(page, id);
  await page.mouse.click(at.x, at.y, { button });
}
// an element dragged by its centre, past drag.threshold, and released over the centre of another
async function dragOnto(page: Page, from: string, onto: string) {
  const start = await centreOf(page, from);
  const end = await centreOf(page, onto);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + THRESHOLD + 2, start.y + THRESHOLD + 2, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
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
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  // File › Open with the browser's file chooser, as a person opens a project
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
});

test('the row’s lock locks its element and keeps the selection; the row keeps it shown and pressed; a second click unlocks; each is an undo step', runs(OPEN, SELECT, LOCK, CTRL_Z, CTRL_SHIFT_Z), async ({ page }) => {
  await clickNode(page, 'n-title');
  expect(await read(page)).toMatchObject({ locked: [], selection: ['n-title'], undoSteps: 0 });

  await runDoor(page, LOCK, { args: { target: 'n-intro' } });
  await expect.poll(() => locks(page)).toEqual(['n-intro=true']);
  expect(await read(page)).toMatchObject({ selection: ['n-title'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Locked: Intro');
  // away from the row, its lock stays shown and pressed, in place of the tag; the other rows' locks do not show
  await pointerAway(page);
  expect(await opacity(page, LOCK, 'n-intro')).toBe('1');
  await expect(control(page, LOCK, { args: { target: 'n-intro' } })).toHaveAttribute('aria-pressed', 'true');
  expect(await control(page, ROW, { args: { target: 'n-intro' } }).locator('.row__meta').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  expect(await opacity(page, LOCK, 'n-title')).toBe('0');

  await runDoor(page, LOCK, { args: { target: 'n-intro' } });
  await expect.poll(() => locks(page)).toEqual([]);
  expect(await read(page)).toMatchObject({ selection: ['n-title'], undoSteps: 2 });
  await expect(status(page)).toHaveText('Unlocked: Intro');
  await expect(control(page, LOCK, { args: { target: 'n-intro' } })).toHaveAttribute('aria-pressed', 'false');
  await pointerAway(page);
  expect(await opacity(page, LOCK, 'n-intro')).toBe('0');

  // undo locks it again, then gives back the document it had; redo locks it
  await runDoor(page, CTRL_Z);
  await expect.poll(() => locks(page)).toEqual(['n-intro=true']);
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).document).toEqual(FIXTURE_DOCUMENT);
  await runDoor(page, CTRL_SHIFT_Z);
  await expect.poll(() => locks(page)).toEqual(['n-intro=true']);
});

test('a locked element is still selected, but Delete, the move keys, R, C, Ctrl+D and P say what to unlock and change nothing; unlocked, Delete removes it', runs(OPEN, SELECT, CONTEXT_OPEN, CONTEXT_LOCK, DELETE, MOVE_UP, MOVE_DOWN, WRAP_ROW, WRAP_COLUMN, DUPLICATE, PROMOTE), async ({ page }) => {
  // the context menu opened on Intro selects it, and its Lock locks it
  await clickNode(page, 'n-intro', 'right');
  await runDoor(page, CONTEXT_LOCK);
  await expect.poll(() => locks(page)).toEqual(['n-intro=true']);
  await expect(status(page)).toHaveText('Locked: Intro');
  const locked = (await read(page)).document;

  const tries: readonly (readonly [string, string])[] = [
    [DELETE, 'Unlock Intro before deleting it.'],
    [MOVE_UP, 'Unlock Intro before moving it.'],
    [MOVE_DOWN, 'Unlock Intro before moving it.'],
    [WRAP_ROW, 'Unlock Intro before changing it.'],
    [WRAP_COLUMN, 'Unlock Intro before changing it.'],
    [DUPLICATE, 'Unlock Intro before changing it.'],
    [PROMOTE, 'Unlock Intro before moving it.'],
  ];
  for (const [door, said] of tries) {
    // a click selects it again, so each key's own words replace the status
    await clickNode(page, 'n-intro');
    await expect(status(page), door).toHaveText('Intro selected.');
    await runDoor(page, door);
    await expect(status(page), door).toHaveText(said);
    const now = await read(page);
    expect(now.document, door).toEqual(locked);
    expect(now.selection, door).toEqual(['n-intro']);
    expect(now.undoSteps, door).toBe(1);
  }

  // unlocked from the same menu, Delete removes it
  await clickNode(page, 'n-intro', 'right');
  await runDoor(page, CONTEXT_LOCK);
  await expect(status(page)).toHaveText('Unlocked: Intro');
  await clickNode(page, 'n-intro');
  await runDoor(page, DELETE);
  await expect.poll(() => childrenOf(page, 'n-hero')).toEqual(['n-title', 'n-actions']);
  await expect(status(page)).toHaveText('Deleted Intro.');
});

test('inside a locked element: the Hide and Lock of its rows, Delete, Alt+ArrowRight into it and a double-click on its text name the lock and change nothing', runs(OPEN, SELECT, LOCK, EYE, DELETE, WALK_UP, NEST, EDIT_DOUBLE_CLICK), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect.poll(() => locks(page)).toEqual(['n-hero=true']);
  const locked = (await read(page)).document;

  // only the element that carries the lock unlocks; what it holds keeps its flags
  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect(status(page)).toHaveText('Intro is locked by Hero; unlock Hero first.');
  await runDoor(page, LOCK, { args: { target: 'n-title' } });
  await expect(status(page)).toHaveText('Title is locked by Hero; unlock Hero first.');
  expect((await read(page)).document).toEqual(locked);

  await clickNode(page, 'n-actions');
  await expect(status(page)).toHaveText('Actions selected.');
  await runDoor(page, DELETE);
  await expect(status(page)).toHaveText('Actions is locked by Hero; unlock Hero first.');
  expect((await read(page)).document).toEqual(locked);

  // Plans, reached from a perk's text with ArrowUp, would go into Hero, the container before it
  await clickNode(page, 'n-perk-one-text');
  for (let level = 0; level < 3; level += 1) await runDoor(page, WALK_UP);
  await expect.poll(() => selection(page)).toEqual(['n-plans']);
  await runDoor(page, NEST);
  await expect(status(page)).toHaveText('Unlock Hero before adding elements to it.');
  expect((await read(page)).document).toEqual(locked);

  // a double-click on the Title's text starts no edit (spec, Problems in Pager 3)
  const title = await centreOf(page, 'n-title');
  await page.mouse.dblclick(title.x, title.y);
  await expect(status(page)).toHaveText('Title is locked by Hero; unlock Hero first.');
  expect(await drawn(page, 'n-title').getAttribute('contenteditable')).toBeNull();
  const after = await read(page);
  expect(after.document).toEqual(locked);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(1);
});

test('Enter on a locked text starts no edit and says what to unlock; unlocked, Enter edits it', runs(OPEN, SELECT, LOCK, EDIT_ENTER), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, LOCK, { args: { target: 'n-intro' } });
  await expect.poll(() => locks(page)).toEqual(['n-intro=true']);
  const locked = (await read(page)).document;
  // the focus back on the canvas: a click on Intro, which keeps it selected
  await clickNode(page, 'n-intro');
  await expect(status(page)).toHaveText('Intro selected.');
  await runDoor(page, EDIT_ENTER);
  await expect(status(page)).toHaveText('Unlock Intro before editing its text.');
  expect(await drawn(page, 'n-intro').getAttribute('contenteditable')).toBeNull();
  expect((await read(page)).document).toEqual(locked);

  await runDoor(page, LOCK, { args: { target: 'n-intro' } });
  await expect.poll(() => locks(page)).toEqual([]);
  await clickNode(page, 'n-intro');
  await expect(status(page)).toHaveText('Intro selected.');
  await runDoor(page, EDIT_ENTER);
  await expect(status(page)).toHaveText('Editing text — Enter or click away to keep it, Escape to cancel.');
  await expect(drawn(page, 'n-intro')).toHaveAttribute('contenteditable', 'plaintext-only');
});

test('a locked container takes no element from a palette tile; outside it the same tile inserts', runs(OPEN, SELECT, LOCK, INSERT_PANEL, TILE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect.poll(() => locks(page)).toEqual(['n-hero=true']);
  const locked = (await read(page)).document;
  await runDoor(page, INSERT_PANEL);
  // with the Title selected, the new element would go right after it, in Hero
  await runDoor(page, TILE, { args: { entry: 'paragraph' } });
  await expect(status(page)).toHaveText('Unlock Hero before adding elements to it.');
  const now = await read(page);
  expect(now.document).toEqual(locked);
  expect(now.selection).toEqual(['n-title']);
  expect(now.undoSteps).toBe(1);

  // after the Footer's Note, outside the lock, the same tile inserts
  await clickNode(page, 'n-note');
  await runDoor(page, TILE, { args: { entry: 'paragraph' } });
  await expect.poll(async () => (await childrenOf(page, 'n-footer')).length).toBe(2);
});

test('a drag moves no locked element and drops nothing into a locked one; unlocked, the same drag moves', runs(OPEN, SELECT, MENU_LOCK, LOCK, DRAG_INSIDE), async ({ page }) => {
  // the Footer's Note locked from Element actions, then dragged into the empty Actions
  await clickNode(page, 'n-note');
  await runDoor(page, MENU_LOCK);
  await expect.poll(() => locks(page)).toEqual(['n-note=true']);
  await expect(status(page)).toHaveText('Locked: Note');
  const noteLocked = (await read(page)).document;
  await dragOnto(page, 'n-note', 'n-actions');
  await expect(status(page)).toHaveText('Unlock Note before moving it.');
  expect((await read(page)).document).toEqual(noteLocked);
  expect((await read(page)).undoSteps).toBe(1);

  // Note unlocked and Hero locked: Actions, inside Hero, takes nothing
  await runDoor(page, MENU_LOCK);
  await expect(status(page)).toHaveText('Unlocked: Note');
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect.poll(() => locks(page)).toEqual(['n-hero=true']);
  const heroLocked = (await read(page)).document;
  await dragOnto(page, 'n-note', 'n-actions');
  await expect(status(page)).toHaveText('Actions is locked by Hero; unlock Hero first.');
  expect((await read(page)).document).toEqual(heroLocked);

  // Hero unlocked, the same drag puts Note in Actions
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect.poll(() => locks(page)).toEqual([]);
  await dragOnto(page, 'n-note', 'n-actions');
  await expect.poll(() => childrenOf(page, 'n-actions')).toEqual(['n-note']);
});

test('Arrange › Remove wrapper keeps a locked wrapper around its children', runs(OPEN, SELECT, WALK_UP, MENU_LOCK, UNWRAP), async ({ page }) => {
  // the Grid: its cards cover it whole, so it is reached from a card's title with ArrowUp twice
  await clickNode(page, 'n-card-a-title');
  await runDoor(page, WALK_UP);
  await runDoor(page, WALK_UP);
  await expect.poll(() => selection(page)).toEqual(['n-grid']);
  await runDoor(page, MENU_LOCK);
  await expect.poll(() => locks(page)).toEqual(['n-grid=true']);
  const locked = (await read(page)).document;
  await runDoor(page, UNWRAP);
  await expect(status(page)).toHaveText('Unlock Grid before changing it.');
  const now = await read(page);
  expect(now.document).toEqual(locked);
  expect(now.selection).toEqual(['n-grid']);
  expect(now.undoSteps).toBe(1);
});

// spec select-container-children, Problems in Pager 2: a locked sibling is left out, and the status bar counts it
test('Ctrl+A leaves out a locked sibling, and the status bar says how many', runs(OPEN, SELECT, MENU_LOCK, SELECT_ALL), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, MENU_LOCK);
  await expect.poll(() => locks(page)).toEqual(['n-title=true']);
  await clickNode(page, 'n-intro');
  await runDoor(page, SELECT_ALL);
  await expect.poll(() => selection(page)).toEqual(['n-intro', 'n-actions']);
  await expect(status(page)).toHaveText('2 elements selected, 1 locked or hidden left out.');
});

test('the page root cannot be locked: the status bar says why and nothing changes', runs(OPEN, ROW, LOCK), async ({ page }) => {
  await runDoor(page, ROW, { args: { target: 'n-page' } });
  await expect.poll(() => selection(page)).toEqual(['n-page']);
  await runDoor(page, LOCK, { args: { target: 'n-page' } });
  await expect(status(page)).toHaveText('The page root cannot be locked.');
  const now = await read(page);
  expect(now.document).toEqual(FIXTURE_DOCUMENT);
  expect(now.selection).toEqual(['n-page']);
  expect(now.undoSteps).toBe(0);
});

test('the lock survives an immediate reload and is in the saved project', runs(OPEN, SELECT, LOCK, SAVE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, LOCK, { args: { target: 'n-card-c' } });
  await expect.poll(() => locks(page)).toEqual(['n-card-c=true']);
  const locked = (await read(page)).document;
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect((await read(page)).document).toEqual(locked);

  const download = page.waitForEvent('download');
  await runDoor(page, SAVE);
  const file: Download = await download;
  const saved = JSON.parse((unzip(fs.readFileSync(await file.path())).get('project.json') as Buffer).toString('utf8')) as unknown;
  expect(saved).toEqual(locked);
});
