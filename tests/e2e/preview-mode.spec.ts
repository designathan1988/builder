// preview-mode beyond its scenarios (spec/behavior/preview-mode.md): the preview is the exported page run as a browser
// runs it: a hover value applies when the pointer is over the element, links open in a new tab (never the editor),
// no editor chrome is left over it, and the preview changes nothing in the document.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const HOVER = 'view.setStyleState#menu-style-state-hover';
const BASE = 'view.setStyleState#menu-style-state-base';
const COLOR = 'style.set#inspector-color';
const PREVIEW = 'view.enterPreview#key-ctrl-p-in-global';
const EXIT = 'view.exitPreview#key-escape-in-preview';
type Port = { document: () => unknown };
const documentNow = (page: Page) => page.evaluate(() => JSON.stringify((window as unknown as { __builderTestPort: Port }).__builderTestPort.document()));

test('the preview runs the exported page: hover applies, links open in a new tab, the document stays as it was', runs(OPEN, ROW, HOVER, BASE, COLOR, PREVIEW, EXIT), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await runDoor(page, HOVER);
  const field = control(page, COLOR).locator('input').first();
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('#aa0000\n');
  await runDoor(page, BASE);
  const before = await documentNow(page);

  await runDoor(page, PREVIEW);
  const preview = page.frameLocator('[data-region="preview-page"]');
  const intro = preview.locator('p').first();
  // no editor chrome over the page: the canvas's selection outline is not reachable where the page is
  await expect(page.locator('[data-region="preview-page"]')).toBeVisible();
  const box = await page.locator('[data-region="preview-page"]').boundingBox();
  if (box === null) throw new Error('the preview is not laid out');
  const onTop = await page.evaluate(([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.getAttribute('data-region') ?? null, [box.x + 20, box.y + 20]);
  expect(onTop).toBe('preview-page');
  const resting = await intro.evaluate((el) => getComputedStyle(el).color);
  expect(resting).not.toBe('rgb(170, 0, 0)');
  await intro.hover();
  await expect.poll(() => intro.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(170, 0, 0)');
  // a link of the page opens in a new tab, never in the editor
  expect(await preview.locator('base').getAttribute('target')).toBe('_blank');

  await runDoor(page, EXIT);
  await expect(page.locator('[data-region="preview-page"]')).toHaveCount(0);
  expect(await documentNow(page)).toBe(before);
});
