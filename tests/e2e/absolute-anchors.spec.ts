// absolute-anchors beyond its scenarios (spec/behavior/absolute-anchors.md, Problems in Pager 3): the anchor tabs are
// never covered by other canvas chrome. A narrow positioned element's top tab, just above the middle of its top edge,
// would meet the selection's label, which sits above the element from its left edge: the tab moves past it. The
// scenarios cannot say where chrome is drawn: this test reads the boxes in Chrome.
import fs from 'node:fs';
import { expect, test, type Locator } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const WIDTH = 'style.set#inspector-width';
const POSITION = 'position.setMode#inspector-position';
const TOP_TAB = 'position.setAnchors#handle-anchor-top';

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('not laid out');
  return box;
};
const meet = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the top anchor tab of a narrow element is not covered by its label nor the quick panel chip', runs(OPEN, ROW, WIDTH, POSITION, TOP_TAB), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  const width = control(page, WIDTH).locator('input').first();
  await width.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('40\n');
  await control(page, POSITION, { args: { mode: 'absolute' } }).click();
  const tab = page.locator(`[data-door="${TOP_TAB}"]`);
  await expect(tab).toBeVisible();
  const label = page.locator('[data-chrome="label"][data-label-for="n-intro"]');
  await expect(label).toBeVisible();
  // the label, wider than half the element, would reach the middle of its top edge
  const intro = await page.frameLocator('.frame__page').locator('[data-node="n-intro"]').evaluate((el) => el.getBoundingClientRect().width);
  expect(intro).toBeLessThan(60);
  const tabBox = await boxOf(tab);
  expect(meet(tabBox, await boxOf(label)), 'the top tab meets the label').toBe(false);
  const chip = page.locator('.quick-panel-chip');
  if ((await chip.count()) > 0) expect(meet(tabBox, await boxOf(chip)), 'the top tab meets the quick panel chip').toBe(false);
});
