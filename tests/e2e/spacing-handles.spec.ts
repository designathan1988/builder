// spacing-handles beyond its scenarios (spec/behavior/spacing-handles.md): in Padding mode the four sides are drawn as
// tinted bands labelled with their values (Problems in Pager 1), as thick on the screen as the padding times the zoom;
// Margin mode draws the margin's bands in another colour; Escape on the canvas leaves the mode (the selection stays)
// and the bands go. The scenarios cannot say what the canvas draws: this test reads the bands in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const MODE = 'canvas.setEditMode#quick-panel-edit-on-canvas';
const ESCAPE = 'canvas.setEditMode#key-escape-in-canvas-edit-mode';
const TOP = 'style.setSpacing#handle-padding-top-band';

const bands = (page: Page) => page.locator('[data-canvas-overlay] [data-edit-handle]');
// the quick panel's Edit on canvas menu opened (its button: no door of its own) and a mode chosen
async function chooseMode(page: Page, mode: string): Promise<void> {
  if ((await page.locator('[data-quick-panel-chip][aria-expanded="false"]').count()) > 0) await page.locator('[data-quick-panel-chip]').click();
  await page.locator(`[data-door="${MODE}"][aria-haspopup]`).click();
  await control(page, MODE, { args: { mode } }).click();
}

test('padding and margin bands are drawn with their values, and Escape takes them away', runs(OPEN, ROW, MODE, ESCAPE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-hero' } }).click();
  await expect(bands(page)).toHaveCount(0);
  await chooseMode(page, 'padding');
  await expect(bands(page)).toHaveCount(4);
  // Hero's padding: 56px top, 40px sides; its top band as tall as 56 CSS px on the screen, tinted, labelled 56
  const top = page.locator(`[data-canvas-overlay] [data-door="${TOP}"]`);
  await expect(top).toHaveText('56');
  const zoom = await page.evaluate(() => document.querySelector<HTMLIFrameElement>('.frame__page')?.currentCSSZoom ?? 1);
  const height = (await top.boundingBox())?.height ?? 0;
  expect(Math.abs(height - 56 * zoom)).toBeLessThan(1);
  const tint = (locator: typeof top) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const padding = await tint(top);
  expect(padding).not.toBe('rgba(0, 0, 0, 0)');
  // Margin mode: other bands, in another colour
  await chooseMode(page, 'margin');
  await expect(page.locator('[data-canvas-overlay] [data-door="style.setSpacing#handle-margin-top-band"]')).toHaveCount(1);
  expect(await tint(page.locator('[data-canvas-overlay] [data-door="style.setSpacing#handle-margin-top-band"]'))).not.toBe(padding);
  // Escape on the canvas leaves the mode, and only the mode: the selection stays (the canvas's own Escape waits)
  await page.locator('[data-quick-panel-chip][aria-expanded="true"]').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await runDoor(page, ESCAPE);
  await expect(bands(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __builderTestPort: { selection: () => string[] } }).__builderTestPort.selection())).toEqual(['n-hero']);
});
