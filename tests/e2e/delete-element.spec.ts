// delete-element beyond its scenarios (spec/behavior/delete-element.md): the Edit menu's Delete, a door of the command
// a user can reach once it is built, and the toast that follows a delete (spec, Problems 2): at most one is shown, a
// new delete replaces it, its Undo undoes the most recent delete only, and the next message takes it away. The
// document, the selection and the history are read through the read-only test port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const MENU_DELETE = 'element.delete#menu-edit';
const KEY_DELETE = 'element.delete#key-delete-in-canvas';
const TOAST_UNDO = 'history.undo#toast-undo';
const ADD = 'selection.add#canvas-click-element-shift';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';

interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
// the ids of the Hero's children, the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const hero = p.document().pages[0]?.tree.children.find((c) => c.id === 'n-hero');
    return { hero: hero?.children.map((c) => c.id) ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('Edit › Delete is disabled with its reason while nothing is selected', runs('project.open#menu-file', MENU_DELETE), async ({ page }) => {
  await openMenu(page, 'edit');
  const item = page.locator(`[data-door="${MENU_DELETE}"]`);
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await expect(item).toHaveAttribute('title', /Select an element first\./);
  await item.click({ force: true });
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: [], undoSteps: 0 });
});

test('Edit › Delete deletes the selection like the keys', runs('project.open#menu-file', SELECT, MENU_DELETE), async ({ page }) => {
  await clickNode(page, 'n-intro');
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro'], undoSteps: 0 });
  await runDoor(page, MENU_DELETE);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-actions'], selection: ['n-actions'], undoSteps: 1 });
  await expect(drawn(page, 'n-intro')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Deleted Intro.');
});

test('a delete removes every selected root in one step and one Undo restores them all', runs('project.open#menu-file', SELECT, ADD, KEY_DELETE, CTRL_Z), async ({ page }) => {
  // Intro, then Actions added with Shift: two roots, the primary Intro first
  await clickNode(page, 'n-intro');
  await page.keyboard.down('Shift');
  await clickNode(page, 'n-actions');
  await page.keyboard.up('Shift');
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro', 'n-actions'], undoSteps: 0 });

  await runDoor(page, KEY_DELETE);
  // both leave; the primary's next sibling leaves too, so the selection moves to its previous sibling
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title'], selection: ['n-title'], undoSteps: 1 });
  await expect(drawn(page, 'n-intro')).toHaveCount(0);
  await expect(drawn(page, 'n-actions')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Deleted 2 elements.');

  // one Undo puts both back at their indexes with their ids, and the selection from before the delete
  await runDoor(page, CTRL_Z);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro', 'n-actions'], undoSteps: 0 });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
  await expect(drawn(page, 'n-actions')).toHaveCount(1);
});

test('the toast: one at most, a new delete replaces it, its Undo undoes the most recent delete only, the next message takes it away', runs('project.open#menu-file', SELECT, KEY_DELETE, TOAST_UNDO), async ({ page }) => {
  const toast = page.locator('[data-region="toast"]');
  await expect(toast).toHaveCount(0);
  await clickNode(page, 'n-intro');
  await runDoor(page, KEY_DELETE);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText('Deleted Intro.');
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-actions'], selection: ['n-actions'], undoSteps: 1 });

  // a second delete replaces the toast: still one, naming the second
  await runDoor(page, KEY_DELETE);
  expect(await read(page)).toEqual({ hero: ['n-title'], selection: ['n-title'], undoSteps: 2 });
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText('Deleted Actions.');
  await expect(toast).not.toContainText('Intro');

  // its Undo undoes the most recent delete only: Actions comes back at its index with its id, Intro stays deleted
  await runDoor(page, TOAST_UNDO);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-actions'], selection: ['n-actions'], undoSteps: 1 });
  await expect(drawn(page, 'n-actions')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Undone');
  await expect(toast).toHaveCount(0);

  // the next message takes a toast away: a click that selects
  await runDoor(page, KEY_DELETE);
  await expect(toast).toHaveCount(1);
  await clickNode(page, 'n-title');
  await expect(page.getByRole('status')).toHaveText('Title selected.');
  await expect(toast).toHaveCount(0);
});
