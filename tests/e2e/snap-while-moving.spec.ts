// snap-while-moving beyond its scenarios (spec/behavior/snap-while-moving.md, Problems in Pager 4): while a free drag
// snaps, the line it snapped to is drawn at the target's place, from the moving element to the target, and the target
// is outlined; the release takes both away. The scenarios read the document after the release: this test holds the
// drag and reads the chrome and the page in Chrome.
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

// a node's box on the screen: its box in the page times the frame's zoom, from the frame's content box
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

test('a snapping drag draws the line from the element to the edge it snapped to and outlines that element', runs(OPEN, ROW, POSITION, SNAP, MOVE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await control(page, POSITION, { args: { mode: 'absolute' } }).click();
  await runDoor(page, SNAP);
  const title = await screenBox(page, 'n-title');
  const intro = await screenBox(page, 'n-intro');
  // Title's right edge taken 3 page px short of Intro's right edge, and held there
  const travel = intro.right - title.right - 3 * title.zoom;
  const from = { x: title.x + 10, y: (title.y + title.bottom) / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 3 });
  await page.mouse.move(from.x + travel, from.y + 120, { steps: 12 });
  const line = page.locator('[data-snap-line="x"]');
  await expect(line).toHaveAttribute('data-snap-source', 'element');
  const drawn = await line.boundingBox();
  if (drawn === null) throw new Error('the snap line is not laid out');
  // at Intro's right edge, from the moving element down to Intro, which it reaches
  expect(Math.abs(drawn.x - intro.right)).toBeLessThan(1.5);
  const moved = await screenBox(page, 'n-title');
  expect(drawn.y).toBeLessThanOrEqual(intro.y + 1);
  expect(drawn.y + drawn.height).toBeGreaterThanOrEqual(moved.bottom - 1);
  // the element snapped to: Title's right edge now at Intro's
  expect(Math.abs(moved.right - intro.right)).toBeLessThan(1.5);
  const target = page.locator('[data-snap-target="n-intro"]');
  const outline = await target.boundingBox();
  if (outline === null) throw new Error('the target is not outlined');
  expect(Math.abs(outline.x + outline.width - intro.right)).toBeLessThan(1.5);
  await page.mouse.up();
  await expect(line).toHaveCount(0);
  await expect(target).toHaveCount(0);
});
