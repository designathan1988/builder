// Space: the focused control's or the pan's (spec zoom-wheel-pan, Problems in Pager 2; the audit's A1.1, elements-
// lists). With the pointer resting over the canvas, a palette tile the keyboard reached (Tab) takes Space and inserts
// its element; a tile a click left focused never keeps Space from the pan: Space held with a drag over the canvas moves
// the page and inserts nothing. The document is read through the read-only test port, the page's place on the screen.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SPACE_IN_PALETTE = 'element.insert#key-space-in-palette';
const ZOOM_400 = 'view.zoomTo#menu-zoom-400';

interface Tree {
  readonly type: string;
  readonly children: readonly Tree[];
}
// how many paragraphs the document holds
async function paragraphs(page: Page): Promise<number> {
  const doc = (await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document())) as { pages: { tree: Tree }[] };
  const count = (n: Tree): number => (n.type === 'paragraph' ? 1 : 0) + n.children.reduce((sum, c) => sum + count(c), 0);
  return doc.pages.reduce((sum, p) => sum + count(p.tree), 0);
}
// the middle of the stage, over the page
async function overCanvas(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.frame__page').boundingBox();
  if (box === null) throw new Error('the page is not laid out');
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 300) };
}
// where the page is on the screen: a pan moves it by the pointer's travel (at 400 %, where it is larger than the stage)
const pageLeft = async (page: Page) => (await page.locator('.frame__page').boundingBox())?.x ?? Number.NaN;
const paragraphTile = (page: Page) => control(page, TILE, { args: { entry: 'paragraph' } });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  await runDoor(page, INSERT_PANEL);
});

test('a tile the keyboard reached takes Space with the pointer over the canvas and inserts its element', runs(OPEN, INSERT_PANEL, SPACE_IN_PALETTE), async ({ page }) => {
  const at = await overCanvas(page);
  await page.mouse.move(at.x, at.y);
  const before = await paragraphs(page);
  const focused = () => paragraphTile(page).evaluate((el) => el === document.activeElement);
  for (let i = 0; i < 400 && !(await focused()); i += 1) await page.keyboard.press('Tab');
  expect(await focused()).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => paragraphs(page)).toBe(before + 1);
});

test('a tile a click left focused leaves Space to the pan: held with a drag over the canvas it moves the page and inserts nothing', runs(OPEN, INSERT_PANEL, ZOOM_400, TILE), async ({ page }) => {
  await runDoor(page, ZOOM_400);
  const before = await paragraphs(page);
  await paragraphTile(page).click();
  await expect.poll(() => paragraphs(page)).toBe(before + 1);
  const at = await overCanvas(page);
  await page.mouse.move(at.x, at.y);
  const left = await pageLeft(page);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(at.x + 100, at.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect.poll(() => pageLeft(page)).toBeCloseTo(left + 100, 0);
  expect(await paragraphs(page)).toBe(before + 1);
});
