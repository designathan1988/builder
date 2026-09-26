// workspace-settings-dialog beyond its scenarios (spec/behavior/workspace-settings-dialog.md): the dialog takes the
// focus, keeps Tab inside it (a modal, Problems in Pager 2) and, closed with Escape, gives the focus back to the menu
// it was opened from; its switches hide the page's guides on the canvas and the rulers, the stage then taking the
// rulers' place, and both stay hidden after a reload while the document keeps its guide.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { door, runDoor, runs } from './door.ts';

const OPEN = 'workspace.openDialog#menu-view-guides-grids';
const ESCAPE = 'ui.dismiss#key-escape-in-dialog';
const RULERS = 'view.toggleRulers#guides-grids-rulers';
const GUIDES = 'guides.toggleVisible#guides-grids-manual-guides';
const FROM_TOP = 'guides.create#canvas-drag-top-ruler-page';

const DIALOG = '[data-region="guides-grids-dialog"]';
const focusInDialog = (page: Page) => page.evaluate((selector) => document.querySelector(selector)?.contains(document.activeElement) === true, DIALOG);
type Port = { document: () => { pages: { tree: { guides?: unknown[] } }[] } };
const guideCount = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: Port }).__builderTestPort.document().pages[0]?.tree.guides?.length ?? 0);

test('the dialog takes the focus, keeps Tab inside it, and Escape gives the focus back to its menu', runs(OPEN, ESCAPE), async ({ page }) => {
  await openEditor(page);
  await runDoor(page, OPEN);
  await expect(page.locator(DIALOG)).toBeVisible();
  expect(await focusInDialog(page)).toBe(true);
  // Tab and Shift+Tab, more times than the dialog has controls: the focus never leaves it
  const controls = await page.locator(DIALOG).locator('button, input').count();
  for (let i = 0; i < controls + 3; i += 1) {
    await page.keyboard.press('Tab');
    expect(await focusInDialog(page), `after ${i + 1} Tab`).toBe(true);
  }
  for (let i = 0; i < controls + 3; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusInDialog(page), `after ${i + 1} Shift+Tab`).toBe(true);
  }
  await runDoor(page, ESCAPE);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  const menu = door(OPEN).menu ?? '';
  await expect(page.locator(`.menu-button[data-menu="${menu}"]`)).toBeFocused();
});

test('the switches hide the guides and the rulers, the stage takes the rulers’ place, and both stay hidden after a reload', runs(FROM_TOP, OPEN, RULERS, GUIDES), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  // a guide out of the top ruler
  const ruler = page.locator('[data-ruler="horizontal"]');
  const box = await ruler.boundingBox();
  if (box === null) throw new Error('no top ruler');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-guide="horizontal-1"]')).toBeVisible();

  await runDoor(page, OPEN);
  await runDoor(page, GUIDES);
  await expect(page.locator('[data-guide="horizontal-1"]')).toHaveCount(0);
  await runDoor(page, RULERS);
  await expect(ruler).toBeHidden();
  const stage = await page.locator('[data-canvas-stage]').boundingBox();
  const area = await page.locator('.stage-wrap').boundingBox();
  if (stage === null || area === null) throw new Error('no stage');
  expect({ x: stage.x, y: stage.y, width: stage.width, height: stage.height }).toEqual({ x: area.x, y: area.y, width: area.width, height: area.height });

  await page.reload();
  await page.locator('.workbench').waitFor();
  expect(await guideCount(page)).toBe(1);
  await expect(page.locator('[data-ruler="horizontal"]')).toBeHidden();
  await expect(page.locator('[data-guide="horizontal-1"]')).toHaveCount(0);
  // switched back on, both are drawn again
  await runDoor(page, OPEN);
  await runDoor(page, GUIDES);
  await runDoor(page, RULERS);
  await expect(page.locator('[data-guide="horizontal-1"]')).toBeVisible();
  await expect(page.locator('[data-ruler="horizontal"]')).toBeVisible();
});
