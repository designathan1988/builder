// select-container-children beyond its scenarios (spec/behavior/select-container-children.md): Edit › Select all, a
// door of the command a user can reach once it is built, selects the element and its siblings as Ctrl+A does; a
// hidden sibling is left out and the status bar counts it (spec, Problems in Pager 2). The selection is read through
// the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const MENU_ALL = 'selection.selectAllInContainer#menu-edit';
const KEY_ALL = 'selection.selectAllInContainer#key-ctrl-a-in-canvas';
const HIDE = 'element.toggleHidden#menu-element-actions';

const selection = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return p.selection();
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
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-intro"]')).toHaveCount(1);
});

test('Edit › Select all selects the element and its siblings', runs('project.open#menu-file', SELECT, MENU_ALL), async ({ page }) => {
  await clickNode(page, 'n-intro');
  await runDoor(page, MENU_ALL);
  await expect.poll(() => selection(page)).toEqual(['n-title', 'n-intro', 'n-actions']);
  await expect(page.getByRole('status')).toHaveText('3 elements selected.');
});

test('a hidden sibling is left out, and the status bar says how many', runs('project.open#menu-file', SELECT, HIDE, KEY_ALL), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, HIDE);
  await clickNode(page, 'n-intro');
  await page.keyboard.press('Control+a');
  await expect.poll(() => selection(page)).toEqual(['n-intro', 'n-actions']);
  await expect(page.getByRole('status')).toHaveText('2 elements selected, 1 locked or hidden left out.');
});
