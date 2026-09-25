// move-up-down beyond its scenarios (spec/behavior/move-up-down.md): the Arrange menu's Move up and Move down, doors of
// the commands a user can reach once they are built, run the same command as the keys (spec, Problems 2); several
// selected roots of one parent move together in one undo step and the status bar counts them (spec, Problems 1); roots
// of different parents are refused. The document, the selection and the history are read through the read-only test
// port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ADD = 'selection.add#canvas-click-element-shift';
const MENU_UP = 'element.moveUp#menu-arrange';
const MENU_DOWN = 'element.moveDown#menu-arrange';
const KEY_UP = 'element.moveUp#key-alt-arrow-up-in-canvas';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';
const CTRL_SHIFT_Z = 'history.redo#key-ctrl-shift-z-in-global';

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
// the vertical position of a node's element in the frame's page
const top = (page: Page, id: string) => drawn(page, id).evaluate((el) => el.getBoundingClientRect().top);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

// a click on the canvas at the centre of a node's element (a leaf: the click hits the node itself)
async function clickNode(page: Page, id: string, modifiers: ('Shift' | 'Control')[] = []) {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(at.x, at.y);
  for (const key of modifiers) await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('Arrange › Move up and Move down are disabled with their reason while nothing is selected', runs('project.open#menu-file', MENU_UP, MENU_DOWN), async ({ page }) => {
  for (const ref of [MENU_UP, MENU_DOWN]) {
    await openMenu(page, 'arrange');
    const item = page.locator(`[data-door="${ref}"]`);
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveAttribute('title', /Select an element first\./);
    await item.click({ force: true });
    expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: [], undoSteps: 0 });
    await page.keyboard.press('Escape');
  }
});

test('Arrange › Move up and Move down move the selection like the keys, one undo step each', runs('project.open#menu-file', SELECT, MENU_UP, MENU_DOWN, CTRL_Z, CTRL_SHIFT_Z), async ({ page }) => {
  await clickNode(page, 'n-actions');
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-actions'], undoSteps: 0 });

  await runDoor(page, MENU_UP);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-actions', 'n-intro'], selection: ['n-actions'], undoSteps: 1 });
  expect(await top(page, 'n-actions')).toBeLessThan(await top(page, 'n-intro'));
  await expect(page.getByRole('status')).toHaveText('Moved Actions to position 2 of 3 in Hero.');

  await runDoor(page, MENU_DOWN);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-actions'], undoSteps: 2 });
  expect(await top(page, 'n-actions')).toBeGreaterThan(await top(page, 'n-intro'));
  await expect(page.getByRole('status')).toHaveText('Moved Actions to position 3 of 3 in Hero.');

  // at the end, Move down is refused: nothing changes and no undo step is added
  await runDoor(page, MENU_DOWN);
  await expect(page.getByRole('status')).toHaveText('Already at the end of Hero.');
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-actions'], undoSteps: 2 });

  await runDoor(page, CTRL_Z);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-actions', 'n-intro'], selection: ['n-actions'], undoSteps: 1 });
  await runDoor(page, CTRL_SHIFT_Z);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-actions'], undoSteps: 2 });
});

test('several selected roots of one parent move together in one undo step, and the status bar counts them', runs('project.open#menu-file', SELECT, ADD, KEY_UP, CTRL_Z), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await clickNode(page, 'n-actions', ['Shift']);
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro', 'n-actions'], undoSteps: 0 });

  await runDoor(page, KEY_UP);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-intro', 'n-actions', 'n-title'], selection: ['n-intro', 'n-actions'], undoSteps: 1 });
  expect(await top(page, 'n-actions')).toBeLessThan(await top(page, 'n-title'));
  await expect(page.getByRole('status')).toHaveText('Moved 2 elements within Hero.');

  // a block at the start moves no further
  await runDoor(page, KEY_UP);
  await expect(page.getByRole('status')).toHaveText('Already at the start of Hero.');
  expect(await read(page)).toEqual({ hero: ['n-intro', 'n-actions', 'n-title'], selection: ['n-intro', 'n-actions'], undoSteps: 1 });

  await runDoor(page, CTRL_Z);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro', 'n-actions'], undoSteps: 0 });
});

test('selected roots of different parents are refused and nothing changes', runs('project.open#menu-file', SELECT, ADD, KEY_UP), async ({ page }) => {
  await clickNode(page, 'n-actions');
  await clickNode(page, 'n-note', ['Shift']);
  expect(await read(page)).toMatchObject({ selection: ['n-actions', 'n-note'], undoSteps: 0 });
  const before = await page.evaluate(() => JSON.stringify((window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document()));

  await runDoor(page, KEY_UP);
  await expect(page.getByRole('status')).toHaveText('These elements must share a parent.');
  expect(await page.evaluate(() => JSON.stringify((window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document()))).toBe(before);
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-actions', 'n-note'], undoSteps: 0 });
});
