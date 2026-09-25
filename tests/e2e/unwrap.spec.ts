// unwrap beyond its scenario (spec/behavior/unwrap.md): Arrange › Remove wrapper, a door of the command a user can reach
// once it is built, lifts the children in place as the context menu's item does, in one undo step (spec, Problems 1);
// with an element that has no children, or the page root, the item stays in the menu, disabled, and says why (spec,
// Problems 2), and pressing it changes nothing. The document, the selection and the history are read through the
// read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const PARENT = 'selection.walkParent#key-arrow-up-in-canvas';
const MENU_UNWRAP = 'element.unwrap#menu-arrange';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';

interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
// the ids of the Plans section's children, the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const plans = p.document().pages[0]?.tree.children.find((c) => c.id === 'n-plans');
    return { plans: plans?.children.map((c) => c.id) ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  });

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
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
});

test('Arrange › Remove wrapper lifts the children of the Grid in place, and one undo puts the Grid back', runs('project.open#menu-file', SELECT, PARENT, MENU_UNWRAP, CTRL_Z), async ({ page }) => {
  // the Grid: its cards cover it whole, so it is reached from a card's title with ArrowUp twice
  await clickNode(page, 'n-card-a-title');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => read(page)).toEqual({ plans: ['n-grid', 'n-perks'], selection: ['n-grid'], undoSteps: 0 });
  await runDoor(page, MENU_UNWRAP);
  await expect.poll(() => read(page)).toEqual({ plans: ['n-card-a', 'n-card-b', 'n-card-c', 'n-perks'], selection: ['n-card-a', 'n-card-b', 'n-card-c'], undoSteps: 1 });
  await expect(page.getByRole('status')).toHaveText('Removed the wrapper Grid.');
  await page.keyboard.press('Control+z');
  await expect.poll(() => read(page)).toEqual({ plans: ['n-grid', 'n-perks'], selection: ['n-grid'], undoSteps: 0 });
});

test('with an element without children, or the page root, Remove wrapper is disabled, says why, and changes nothing', runs('project.open#menu-file', SELECT), async ({ page }) => {
  const item = () => control(page, MENU_UNWRAP);
  const before = await read(page);
  // Intro, a paragraph with no children
  await clickNode(page, 'n-intro');
  await openMenu(page, 'arrange');
  await expect(item()).toHaveAttribute('aria-disabled', 'true');
  await expect(item()).toHaveAttribute('title', /Only an element with children, inside a parent, can lose its wrapper\./);
  await item().click({ force: true });
  await page.keyboard.press('Escape');
  expect(await read(page)).toEqual({ ...before, selection: ['n-intro'] });
  // the page root: a click where no element is
  const frame = await page.locator('.frame__page').boundingBox();
  if (!frame) throw new Error('the canvas frame is not drawn');
  await page.mouse.click(frame.x + frame.width - 4, frame.y + frame.height - 4);
  await expect.poll(async () => (await read(page)).selection).toEqual(['n-page']);
  await openMenu(page, 'arrange');
  await expect(item()).toHaveAttribute('aria-disabled', 'true');
  await item().click({ force: true });
  expect(await read(page)).toEqual({ ...before, selection: ['n-page'] });
});
