// layers-drag beyond its scenarios (spec/behavior/layers-drag.md): a drag held over a folded row unfolds it after the
// dwell (interactions.json layers.expandDwell), so the dragged element can be dropped among its children. The
// scenario of this behaviour folds the row with the caret, whose command (layers.setExpanded) is the one the dwell
// runs, so switching that command off also removes its precondition; here the row is folded with ArrowLeft in Layers
// (layers.collapseOrFocusParent), a command of its own. What unfolds is read from the tree itself: the row's
// aria-expanded and its children's rows; the document stays as it was, read through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const FOLD = 'layers.collapseOrFocusParent#key-arrow-left-in-layers-tree';
const DWELL = 'layers.setExpanded#layers-drag-layers-row-collapsed-row-dwell';
const CANCEL = 'drag.cancel#key-escape-in-drag';
const INTERACTIONS = JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: readonly { id: string; value: unknown }[] };
const EXPAND_DWELL = Number(INTERACTIONS.constants.find((c) => c.id === 'layers.expandDwell')?.value);

const documentOf = (page: Page): Promise<unknown> => page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document());
const row = (page: Page, id: string) => control(page, ROW, { args: { target: id } });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
});

test('a drag held over a row folded with ArrowLeft unfolds it after the dwell; Escape leaves the document as it was', runs(OPEN, ROW, FOLD, DWELL, CANCEL), async ({ page }) => {
  expect(EXPAND_DWELL).toBeGreaterThan(0);
  const plans = row(page, 'n-plans');
  await plans.click();
  await page.keyboard.press('ArrowLeft');
  await expect(plans, 'Plans is folded').toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 'n-grid'), 'its children have no row').toHaveCount(0);
  const before = await documentOf(page);

  const title = await row(page, 'n-title').boundingBox();
  const target = await plans.boundingBox();
  if (title === null || target === null) throw new Error('the rows are not laid out');
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2 + 12, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(plans, 'Plans unfolds while the drag rests on it').toHaveAttribute('aria-expanded', 'true', { timeout: EXPAND_DWELL * 4 });
  await expect(row(page, 'n-grid'), 'its children show their rows').toHaveCount(1);

  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await documentOf(page), 'the cancelled drag changed nothing').toEqual(before);
});
