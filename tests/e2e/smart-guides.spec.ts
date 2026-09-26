// smart-guides beyond its scenarios (spec/behavior/smart-guides.md), read in Chrome while a free drag is held:
//  - Problems in Pager 2: a box pulled to an equal gap has both gaps marked with their value;
//  - Problems in Pager 3: with snap off, an alignment with a sibling's edge is drawn, and the box is not moved;
//  - Problems in Pager 1: with smart guides off, a snapping drag draws no line, and snap still moves the box.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const POSITION = 'position.setMode#inspector-position';
const SNAP = 'snap.setEnabled#toolbar-canvas-toolbar-snap';
const MOVE = 'position.move#canvas-drag-positioned-element-containing-block';
const GRIDS = 'workspace.openDialog#menu-view-guides-grids';
const SMART = 'view.toggleSmartGuides#guides-grids-smart-guides';
const CLOSE = 'ui.dismiss#dialog-close';
const SNAP_SETTINGS = 'workspace.openDialog#menu-snap-snap-settings';
const APPLY = 'snap.setSettings#snap-settings-apply';

// a node's box on the screen, from its box in the page and the frame's zoom
const screenBox = (page: Page, id: string) =>
  page.locator('.frame__page').evaluate((frame, node) => {
    const iframe = frame as HTMLIFrameElement;
    const r = iframe.contentDocument?.querySelector(`[data-node="${node}"]`)?.getBoundingClientRect();
    const f = iframe.getBoundingClientRect();
    const z = iframe.currentCSSZoom;
    const style = getComputedStyle(iframe);
    const left = f.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * z;
    const top = f.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * z;
    if (r === undefined) throw new Error(`no ${node}`);
    return { x: left + r.left * z, y: top + r.top * z, right: left + r.right * z, bottom: top + r.bottom * z, zoom: z };
  }, id);

async function openAurora(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
}
async function typeInto(page: Page, property: string, value: string): Promise<void> {
  const field = control(page, `style.set#inspector-${property}`).locator('input').first();
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`${value}\n`);
}
async function makeAbsolute(page: Page, node: string, place: Record<string, string>): Promise<void> {
  await control(page, ROW, { args: { target: node } }).click();
  await control(page, POSITION, { args: { mode: 'absolute' } }).click();
  for (const [property, value] of Object.entries(place)) await typeInto(page, property, value);
}
// pressed on a node, taken past the threshold, and held at this travel on the screen
async function holdDrag(page: Page, node: string, travel: { x: number; y: number }): Promise<void> {
  const box = await screenBox(page, node);
  const from = { x: box.x + 10, y: (box.y + box.bottom) / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 3 });
  await page.mouse.move(from.x + travel.x, from.y + travel.y, { steps: 12 });
}

test('a box pulled to an equal gap has both gaps marked with their value', runs(OPEN, ROW, POSITION, SNAP, SNAP_SETTINGS, APPLY, MOVE), async ({ page }) => {
  await openAurora(page);
  await makeAbsolute(page, 'n-title', { width: '200', top: '100' });
  await makeAbsolute(page, 'n-intro', { width: '200', top: '100', left: '300' });
  await makeAbsolute(page, 'n-actions', { width: '200', top: '100', left: '700' });
  await runDoor(page, SNAP);
  await runDoor(page, SNAP_SETTINGS);
  for (const box of await page.locator('[data-region="snap-settings-dialog"] input[name="targets"]').all()) if (await box.isChecked()) await box.click();
  await runDoor(page, APPLY);
  const actions = await screenBox(page, 'n-actions');
  // Actions taken 64 page px after Intro, the gap between Title and Intro being 60
  await holdDrag(page, 'n-actions', { x: -136 * actions.zoom, y: 0 });
  const marks = page.locator('[data-equal-gap="60"]');
  await expect(marks).toHaveCount(2);
  const intro = await screenBox(page, 'n-intro');
  const title = await screenBox(page, 'n-title');
  const moved = await screenBox(page, 'n-actions');
  const spans = await Promise.all([0, 1].map(async (i) => (await marks.nth(i).boundingBox()) ?? { x: 0, width: 0 }));
  const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
  // one mark from Title's right edge to Intro's left edge, the other from Intro's right edge to Actions' left edge
  expect(spans.some((s) => near(s.x, title.right) && near(s.x + s.width, intro.x))).toBe(true);
  expect(spans.some((s) => near(s.x, intro.right) && near(s.x + s.width, moved.x))).toBe(true);
  await expect(marks.first()).toHaveText('60');
  await page.mouse.up();
  await expect(marks).toHaveCount(0);
});

test('with snap off an alignment with a sibling edge is drawn and the box is not moved', runs(OPEN, ROW, POSITION, MOVE), async ({ page }) => {
  await openAurora(page);
  await makeAbsolute(page, 'n-title', {});
  const title = await screenBox(page, 'n-title');
  const intro = await screenBox(page, 'n-intro');
  // Title's right edge held 3 page px short of Intro's right edge
  await holdDrag(page, 'n-title', { x: intro.right - title.right - 3 * title.zoom, y: 120 });
  const line = page.locator('[data-snap-line="x"]');
  await expect(line).toHaveAttribute('data-snap-source', 'element');
  const drawn = await line.boundingBox();
  if (drawn === null) throw new Error('the alignment line is not laid out');
  expect(Math.abs(drawn.x - intro.right)).toBeLessThan(1.5);
  const moved = await screenBox(page, 'n-title');
  expect((intro.right - moved.right) / title.zoom).toBeGreaterThan(2);
  await page.mouse.up();
  await expect(line).toHaveCount(0);
});

test('with smart guides off a snapping drag draws no line and still snaps', runs(OPEN, ROW, POSITION, SNAP, GRIDS, SMART, CLOSE, MOVE), async ({ page }) => {
  await openAurora(page);
  await makeAbsolute(page, 'n-title', {});
  await runDoor(page, SNAP);
  await runDoor(page, GRIDS);
  await runDoor(page, SMART);
  await runDoor(page, CLOSE);
  const title = await screenBox(page, 'n-title');
  const intro = await screenBox(page, 'n-intro');
  await holdDrag(page, 'n-title', { x: intro.right - title.right - 3 * title.zoom, y: 120 });
  const moved = await screenBox(page, 'n-title');
  // snap pulled the right edge onto Intro's, and nothing is drawn for it
  expect(Math.abs(moved.right - intro.right)).toBeLessThan(1.5);
  await expect(page.locator('[data-snap-line]')).toHaveCount(0);
  await expect(page.locator('[data-snap-target]')).toHaveCount(0);
  await page.mouse.up();
});
