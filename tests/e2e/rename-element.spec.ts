// rename-element beyond its scenarios (spec/behavior/rename-element.md): F2, a double-click on a Layers row's name,
// Arrange › Rename and the context menu's Rename all start the one rename in place (Problems in Pager 1 and 2: no
// dialog). The row's name becomes a field holding the name, selected, with the focus, so typing replaces it; Enter or
// leaving the field keeps it in the document JSON, the row and the canvas label show it, the focus is back on the
// canvas, and the new name survives an immediate reload. A single click on a row's name only selects. The Layers
// section is shown when it was hidden. A locked element, or one inside a locked element, is not renamed: the status
// bar says what to unlock, no field is drawn and the context menu offers no Rename. The document, the selection and
// the history are read through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ROW = 'selection.select#layers-row';
const F2 = 'layers.startRename#key-f2-in-canvas';
const ROW_NAME = 'layers.startRename#layers-row-name';
const MENU_RENAME = 'layers.startRename#menu-arrange';
const CONTEXT_OPEN = 'contextMenu.open#canvas-right-click-element-or-page';
const ROW_CONTEXT_OPEN = 'contextMenu.open#layers-row-secondary-click';
const MENU_ESCAPE = 'ui.dismiss#key-escape-in-menu';
const CONTEXT_RENAME = 'layers.startRename#context-menu';
const CONTEXT_LOCK = 'element.toggleLock#context-menu';
const FIELD = 'element.rename#layers-row-name-field';
const LOCK = 'element.toggleLock#layers-row-lock';
const HIDE_SIDEBAR = 'workspace.toggleLeftDock#key-ctrl-b-in-global';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';

interface Tree {
  readonly id: string;
  readonly name: string;
  readonly children: readonly Tree[];
}
// every node's name by id, the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const names: Record<string, string> = {};
    const visit = (n: Tree) => {
      names[n.id] = n.name;
      n.children.forEach(visit);
    };
    for (const page of p.document().pages) visit(page.tree);
    return { names, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const nameOf = async (page: Page, id: string) => (await read(page)).names[id];
const FIXTURE_NAMES = (() => {
  const names: Record<string, string> = {};
  const visit = (n: Tree) => {
    names[n.id] = n.name;
    n.children.forEach(visit);
  };
  for (const page of (JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { pages: { tree: Tree }[] }).pages) visit(page.tree);
  return names;
})();

const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
const status = (page: Page) => page.getByRole('status');
const field = (page: Page, id: string) => control(page, FIELD, { args: { target: id } });
const rowName = (page: Page, id: string) => control(page, ROW_NAME, { args: { target: id } });
const onCanvas = (page: Page) => page.evaluate(() => document.activeElement === document.body);

// a click on the canvas at the centre of a node's element (a leaf: the click hits the node)
async function clickNode(page: Page, id: string, button: 'left' | 'right' = 'left') {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  await page.mouse.click(at.x, at.y, { button });
}

// the field of a node's row holds the focus, with its whole text selected
async function expectFieldReady(page: Page, id: string, name: string) {
  await expect(field(page, id)).toBeFocused();
  await expect(field(page, id)).toHaveValue(name);
  expect(await field(page, id).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]), 'the whole name is selected').toEqual([0, name.length]);
}

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

test('F2 edits the name in its Layers row, selected, so typing replaces it; Enter keeps it, the row and the canvas label show it, and the focus is back on the canvas', runs(OPEN, SELECT, F2, FIELD), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Intro');
  expect(await read(page)).toEqual({ names: FIXTURE_NAMES, selection: ['n-intro'], undoSteps: 0 });
  // what is typed replaces the selected name: no select-all first
  await page.keyboard.type('Lead');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ names: { ...FIXTURE_NAMES, 'n-intro': 'Lead' }, selection: ['n-intro'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Renamed Intro to Lead.');
  await expect(field(page, 'n-intro')).toHaveCount(0);
  await expect(rowName(page, 'n-intro')).toHaveText('Lead');
  await expect(page.locator('[data-chrome="label"][data-label-for="n-intro"] .chrome__name')).toHaveText('Lead');
  // the canvas has the focus again: F2 starts the next rename
  expect(await onCanvas(page), 'the focus rests on the canvas').toBe(true);
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Lead');
});

test('leaving the field keeps what it holds, and the click that left it selects where it landed', runs(OPEN, SELECT, F2, FIELD), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Intro');
  await page.keyboard.type('Lead');
  await clickNode(page, 'n-title');
  await expect.poll(() => read(page)).toEqual({ names: { ...FIXTURE_NAMES, 'n-intro': 'Lead' }, selection: ['n-title'], undoSteps: 1 });
  await expect(field(page, 'n-intro')).toHaveCount(0);
  await expect(rowName(page, 'n-intro')).toHaveText('Lead');
});

test('a double-click on a row’s name renames that row’s node, which its first click selects; a single click only selects', runs(OPEN, ROW, ROW_NAME, FIELD), async ({ page }) => {
  // one click on a name selects its row's node, as a click on the row does, and draws no field
  await rowName(page, 'n-title').click();
  await expect.poll(async () => (await read(page)).selection).toEqual(['n-title']);
  await expect(page.locator(`[data-door="${FIELD}"]`)).toHaveCount(0);
  // a double-click on another row's name: its first click selects Intro, its second renames it
  await runDoor(page, ROW_NAME, { args: { target: 'n-intro' } });
  await expectFieldReady(page, 'n-intro', 'Intro');
  expect((await read(page)).selection).toEqual(['n-intro']);
  await page.keyboard.type('Hero copy');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ names: { ...FIXTURE_NAMES, 'n-intro': 'Hero copy' }, selection: ['n-intro'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Renamed Intro to Hero copy.');
});

test('Arrange › Rename and the context menu’s Rename start the same rename in the selection’s row', runs(OPEN, SELECT, MENU_RENAME, CONTEXT_OPEN, CONTEXT_RENAME, FIELD), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, MENU_RENAME);
  await expectFieldReady(page, 'n-intro', 'Intro');
  await page.keyboard.type('Lead');
  await page.keyboard.press('Enter');
  await expect.poll(async () => nameOf(page, 'n-intro')).toBe('Lead');

  await clickNode(page, 'n-title', 'right');
  await runDoor(page, CONTEXT_RENAME);
  await expectFieldReady(page, 'n-title', 'Title');
  await page.keyboard.type('Headline');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ names: { ...FIXTURE_NAMES, 'n-intro': 'Lead', 'n-title': 'Headline' }, selection: ['n-title'], undoSteps: 2 });
  // each rename is one undo step
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).names).toEqual({ ...FIXTURE_NAMES, 'n-intro': 'Lead' });
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).names).toEqual(FIXTURE_NAMES);
});

test('a new name survives an immediate reload', runs(OPEN, SELECT, F2, FIELD), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Intro');
  await page.keyboard.type('  Lead  ');
  await page.keyboard.press('Enter');
  // the name is kept without the spaces around it
  await expect.poll(async () => nameOf(page, 'n-intro')).toBe('Lead');
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect((await read(page)).names).toEqual({ ...FIXTURE_NAMES, 'n-intro': 'Lead' });
  await expect(rowName(page, 'n-intro')).toHaveText('Lead');
});

test('with the sidebar hidden, F2 shows the Layers section and edits the name in its row', runs(OPEN, SELECT, HIDE_SIDEBAR, F2, FIELD), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, HIDE_SIDEBAR);
  await expect(rowName(page, 'n-intro')).toHaveCount(0);
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Intro');
  await page.keyboard.type('Lead');
  await page.keyboard.press('Enter');
  await expect.poll(async () => nameOf(page, 'n-intro')).toBe('Lead');
});

test('a locked element, or one inside it, is not renamed: F2 and the double-click say what to unlock and draw no field; the context menu offers no Rename', runs(OPEN, SELECT, LOCK, F2, ROW_NAME, ROW_CONTEXT_OPEN, MENU_ESCAPE), async ({ page }) => {
  // a row's lock acts once something is selected (its predicate): Title first, as a person would
  await clickNode(page, 'n-title');
  await expect(status(page)).toHaveText('Title selected.');
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect(status(page)).toHaveText('Locked: Hero');
  const noField = () => expect(page.locator(`[data-door="${FIELD}"]`)).toHaveCount(0);

  // inside the locked Hero: Intro
  await clickNode(page, 'n-intro');
  await expect(status(page)).toHaveText('Intro selected.');
  await runDoor(page, F2);
  await expect(status(page)).toHaveText('Intro is locked by Hero; unlock Hero first.');
  await noField();
  await runDoor(page, ROW_NAME, { args: { target: 'n-title' } });
  await expect(status(page)).toHaveText('Title is locked by Hero; unlock Hero first.');
  await noField();
  // the locked Hero itself, reached through its row's name
  await runDoor(page, ROW_NAME, { args: { target: 'n-hero' } });
  await expect(status(page)).toHaveText('Unlock Hero before renaming it.');
  await noField();
  // the context menu on Hero's row shows only what applies: its Unlock does, its Rename does not
  await runDoor(page, ROW_CONTEXT_OPEN, { args: { target: 'n-hero' } });
  await expect(page.locator(`[data-region="context-menu"] [data-door="${CONTEXT_LOCK}"]`)).toBeVisible();
  await expect(page.locator(`[data-door="${CONTEXT_RENAME}"]`)).toHaveCount(0);
  expect(await read(page)).toEqual({ names: FIXTURE_NAMES, selection: ['n-hero'], undoSteps: 1 });
  await runDoor(page, MENU_ESCAPE);
  await expect(page.locator('[data-region="context-menu"]')).toHaveCount(0);

  // unlocked, the same F2 renames an element inside it
  await runDoor(page, LOCK, { args: { target: 'n-hero' } });
  await expect(status(page)).toHaveText('Unlocked: Hero');
  await clickNode(page, 'n-intro');
  await runDoor(page, F2);
  await expectFieldReady(page, 'n-intro', 'Intro');
});
