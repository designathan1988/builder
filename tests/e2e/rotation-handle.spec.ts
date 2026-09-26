// rotation-handle beyond its scenarios (spec/behavior/rotation-handle.md, Problems in Pager 1): with Shift held, the
// angle snaps to rotate.snapStep (15°). style.set takes no modifier, so no scenario step can hold Shift: this test drags
// the handle with the real mouse and Shift down, and reads the document.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const HANDLE = 'style.set#handle-rotate';

type Port = { document: () => { pages: { tree: { children: { children: { id: string; styles: { desktop?: { base?: Record<string, string> } } }[] }[] } }[] } };
const titleRotate = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: Port }).__builderTestPort.document().pages[0]?.tree.children[0]?.children[0]?.styles.desktop?.base?.rotate ?? null);

// the handle dragged by an angle along the circle around the element's centre
async function turn(page: Page, degrees: number, shift: boolean): Promise<void> {
  const handle = page.locator(`[data-canvas-overlay] [data-door="${HANDLE}"]`);
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (box === null) throw new Error('the handle is not laid out');
  const centre = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const element = iframe?.contentDocument?.querySelector('[data-node="n-title"]');
    if (!iframe || !element) throw new Error('no Title on the canvas');
    const f = iframe.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    return { x: f.left + (r.left + r.width / 2) * iframe.currentCSSZoom, y: f.top + (r.top + r.height / 2) * iframe.currentCSSZoom };
  });
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = Math.hypot(from.x - centre.x, from.y - centre.y);
  const start = Math.atan2(from.y - centre.y, from.x - centre.x);
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    const angle = start + ((degrees * Math.PI) / 180) * (i / 24);
    await page.mouse.move(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle));
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

// the selection's label and the quick panel's chip beside it reach a narrow element's top-right corner: neither covers
// the handle, which a press must reach
test('a narrow element keeps its rotation handle uncovered by the label and the quick panel chip', runs(OPEN, ROW, HANDLE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  const width = control(page, 'style.set#inspector-width').locator('input').first();
  await width.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('40\n');
  // then as wide as its label less a few pixels, so the chip beside the label stands where the handle is drawn
  const label = page.locator('[data-chrome="label"][data-label-for="n-intro"]');
  await expect(label).toBeVisible();
  const zoom = await page.locator('.frame__page').evaluate((frame) => (frame as HTMLIFrameElement).currentCSSZoom);
  const labelWidth = (await label.boundingBox())?.width ?? 0;
  await width.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`${Math.round((labelWidth - 4) / zoom)}\n`);
  const handle = page.locator(`[data-canvas-overlay] [data-door="${HANDLE}"]`);
  await expect(handle).toBeVisible();
  await expect(page.locator('.quick-panel-chip')).toBeVisible();
  await expect
    .poll(() =>
      handle.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el;
      }),
    )
    .toBe(true);
});

test('with Shift held the handle turns the element in 15° steps; without, to the degree', runs(OPEN, ROW, HANDLE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await turn(page, 50, true);
  await expect.poll(() => titleRotate(page)).toBe('45deg');
  await turn(page, 7, false);
  await expect.poll(() => titleRotate(page)).toBe('52deg');
});
