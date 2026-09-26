// quick-panel beyond its scenarios (spec/behavior/quick-panel.md): the panel dragged by its grip stays where it was
// put for that element after a reload (Problems in Pager 1: its offset from the element, read on the screen), and it
// shows only the fields whose property applies to the element (DESIGN.md: the text fields for an element that holds
// text, none for a section). The scenarios cannot say where the panel is drawn relative to its element, nor which
// fields it draws: this test reads the panel's box and fields in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const GRIP = 'quickPanel.setOffset#panel-drag-quick-panel-grip-canvas';
const FONT_SIZE = 'style.set#quick-panel-font-size';
const WIDTH = 'style.set#quick-panel-width';

const panel = (page: Page) => page.locator('.quick-panel');
async function openPanel(page: Page): Promise<void> {
  await page.locator('[data-quick-panel-chip][aria-expanded="false"]').click();
  await expect(panel(page)).toBeVisible();
}
// the panel's top-left corner from the element's, on the screen
async function offset(page: Page, node: string): Promise<{ x: number; y: number }> {
  const box = await panel(page).boundingBox();
  const element = await page.evaluate((id) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${id}"]`);
    if (!iframe || !el) return null;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const zoom = iframe.currentCSSZoom;
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom };
  }, node);
  if (box === null || element === null) throw new Error('the panel or its element is not drawn');
  return { x: Math.round(box.x - element.x), y: Math.round(box.y - element.y) };
}

test('the panel dragged by its grip keeps its offset from the element after a reload', runs(OPEN, ROW, GRIP), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await openPanel(page);
  const before = await offset(page, 'n-intro');
  // the grip moved 120 px left and 60 px down, inside the stage
  const grip = await control(page, GRIP).boundingBox();
  if (grip === null) throw new Error('the grip is not drawn');
  const from = { x: Math.round(grip.x + grip.width / 2), y: Math.round(grip.y + grip.height / 2) };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 120, from.y + 60, { steps: 10 });
  await page.mouse.up();
  const dragged = await offset(page, 'n-intro');
  expect(dragged).toEqual({ x: before.x - 120, y: before.y + 60 });
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __builderTestPort: { selection: () => string[] } }).__builderTestPort.selection())).toEqual(['n-intro']);
  await openPanel(page);
  await expect.poll(() => offset(page, 'n-intro')).toEqual(dragged);
});

test('the panel shows the fields whose property applies to the element', runs(OPEN, ROW, FONT_SIZE, WIDTH), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  // a section holds no text of its own: no font field, but W
  await control(page, ROW, { args: { target: 'n-hero' } }).click();
  await openPanel(page);
  await expect(panel(page).locator(`[data-door="${WIDTH}"]`)).toHaveCount(1);
  await expect(panel(page).locator(`[data-door="${FONT_SIZE}"]`)).toHaveCount(0);
  // a paragraph: its text fields too
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await expect(panel(page).locator(`[data-door="${FONT_SIZE}"]`)).toHaveCount(1);
});
