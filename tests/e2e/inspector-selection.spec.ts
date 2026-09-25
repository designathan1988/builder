// The inspector never says something the store contradicts (brief "a aplicação completa", first task): its selector
// bar names the one selected element (its name and exported tag), counts several, and says "Nothing selected" only
// when the selection the test port reads is empty.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ADD = 'selection.add#canvas-click-element-shift';
const CLEAR = 'selection.clear#key-escape-in-canvas';

const selection = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return p.selection();
  });

// the screen point at the centre of a node's element (a leaf: a press there hits the node itself)
function centre(page: Page, id: string) {
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-intro"]')).toHaveCount(1);
});

test("the inspector's selector bar names what the store holds selected: one, several, none", runs('project.open#menu-file', SELECT, ADD, CLEAR), async ({ page }) => {
  const bar = page.locator('.selector-bar__element');
  expect(await selection(page)).toEqual([]);
  await expect(bar).toHaveText('Nothing selected');
  const intro = await centre(page, 'n-intro');
  await page.mouse.click(intro.x, intro.y);
  await expect.poll(() => selection(page)).toEqual(['n-intro']);
  await expect(bar.locator('.selector-bar__name')).toHaveText('Intro');
  await expect(bar.locator('.selector-bar__tag')).toHaveText('p');
  const title = await centre(page, 'n-title');
  await page.keyboard.down('Shift');
  await page.mouse.click(title.x, title.y);
  await page.keyboard.up('Shift');
  await expect.poll(() => selection(page)).toEqual(['n-intro', 'n-title']);
  await expect(bar).toHaveText('2 elements selected');
  await page.keyboard.press('Escape');
  await expect.poll(() => selection(page)).toEqual([]);
  await expect(bar).toHaveText('Nothing selected');
});
