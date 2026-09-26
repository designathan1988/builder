// resize-handles beyond its scenarios (spec/behavior/resize-handles.md): the gesture's modifiers, read on every move
// (Shift keeps the aspect ratio of a corner drag, Alt resizes from the centre, so a flow element's width changes by
// twice the travel), whole CSS px, and the handles drawn only where a resize can happen (one selected element, not
// the page, not locked, not several). The document is read through the read-only test port; the handles are the
// chrome's controls of the manifest's resize doors.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ADD = 'selection.add#layers-row-shift';
const LOCK = 'element.toggleLock#layers-row-lock';
const SE = 'geometry.resize#handle-resize-se';
const W = 'geometry.resize#handle-resize-w';
const MOVE = 'element.moveTo#canvas-drag-canvas-element-before-after';

interface Node {
  readonly id: string;
  readonly styles: Record<string, Record<string, Record<string, string>> | undefined>;
  readonly children: readonly Node[];
}
const nodeIn = (tree: Node, id: string): Node | null => (tree.id === id ? tree : tree.children.map((c) => nodeIn(c, id)).find((n) => n !== null) ?? null);
const declared = async (page: Page, id: string): Promise<Record<string, string>> => {
  const document = (await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document())) as { pages: { tree: Node }[] };
  const tree = document.pages[0]?.tree;
  return (tree ? nodeIn(tree, id)?.styles.desktop?.base : undefined) ?? {};
};
const drawnBox = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`).evaluate((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
const zoomOf = (page: Page) => page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).currentCSSZoom);
const handle = (page: Page, ref: string) => page.locator(`[data-canvas-overlay] [data-door="${ref}"]`);

async function dragHandle(page: Page, ref: string, dx: number, dy: number, key: string | null): Promise<void> {
  const box = await handle(page, ref).boundingBox();
  if (box === null) throw new Error(`${ref} is not drawn`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  if (key !== null) await page.keyboard.down(key);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  if (key !== null) await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
});

test('Shift keeps the ratio of a corner drag, in whole px', runs(OPEN, ROW, SE), async ({ page }) => {
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  const before = await drawnBox(page, 'n-title');
  const zoom = await zoomOf(page);
  await dragHandle(page, SE, -200 * zoom, 30 * zoom, 'Shift');
  const written = await declared(page, 'n-title');
  expect(written.width, 'a whole px width').toMatch(/^\d+px$/);
  expect(written.height, 'a whole px height').toMatch(/^\d+px$/);
  const width = parseFloat(written.width ?? '0');
  const height = parseFloat(written.height ?? '0');
  // the ratio kept to the nearest px, and the travel's larger side followed: the height grew
  expect(Math.abs(width / height - before.width / before.height)).toBeLessThan(before.width / before.height / Math.min(width, height) + 0.01);
  expect(height).toBeGreaterThan(before.height);
});

test('Alt resizes from the centre: a flow element\'s width changes by twice the travel', runs(OPEN, ROW, W), async ({ page }) => {
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  const before = await drawnBox(page, 'n-title');
  const zoom = await zoomOf(page);
  await dragHandle(page, W, 100 * zoom, 0, 'Alt');
  const written = await declared(page, 'n-title');
  expect(Math.abs(parseFloat(written.width ?? '0') - (before.width - 200))).toBeLessThanOrEqual(1);
  expect(written.height, 'a side handle writes no height').toBeUndefined();
});

test('a handle clicked without a drag clicks what lies under it: the Hero around its Title is selected, nothing resized', runs(OPEN, ROW, SE), async ({ page }) => {
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  const box = await handle(page, 'geometry.resize#handle-resize-n').boundingBox();
  if (box === null) throw new Error('the north handle is not drawn');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => page.evaluate(() => (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort?.selection())).toEqual(['n-hero']);
  expect(await declared(page, 'n-title'), 'the Title keeps its size').toEqual({});
});

// A handle takes a press only in its hit area, outside the element: its dot, drawn across the edge, overhangs the
// element and must not take it. On a short element (the Intro, about 10 screen px high at the fit zoom) the dots of
// the top and bottom handles reach its middle, so a press there that went to the dot would resize the Intro instead
// of moving it (the hysteresis test of drag-reorder-canvas failed on it, finding 12).
test('a press on a short selected element, under the overhang of a handle\'s dot, moves the element: it never resizes it', runs(OPEN, ROW, MOVE), async ({ page }) => {
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  const screen = (id: string) =>
    page.evaluate((node) => {
      const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
      const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
      if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
      const zoom = iframe.currentCSSZoom;
      const frame = iframe.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
    }, id);
  const intro = await screen('n-intro');
  const south = await handle(page, 'geometry.resize#handle-resize-s').boundingBox();
  if (south === null) throw new Error('the south handle is not drawn');
  // the dot is centred on the bottom edge; the press lands 2 px above that edge, inside the Intro, under the dot
  const dot = await handle(page, 'geometry.resize#handle-resize-s').evaluate((el) => parseFloat(getComputedStyle(el, '::after').height));
  expect(dot / 2, 'the dot overhangs the Intro by more than the press\'s 2 px').toBeGreaterThan(2);
  expect(intro.height, 'the Intro is short enough for the dots to meet its middle').toBeLessThan(dot * 2);
  const at = { x: south.x + south.width / 2, y: intro.y + intro.height - 2 };
  const title = await screen('n-title');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, title.y + title.height / 2 - 1, { steps: 8 });
  await page.mouse.up();
  const document = (await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document())) as { pages: { tree: Node }[] };
  const hero = document.pages[0] ? nodeIn(document.pages[0].tree, 'n-hero') : null;
  expect(hero?.children.map((c) => c.id), 'the Intro moved before the Title').toEqual(['n-intro', 'n-title', 'n-actions']);
  expect(await declared(page, 'n-intro'), 'the Intro keeps its size').toEqual({});
});

test('no handle is drawn on the page, on a locked element or on several elements', runs(OPEN, ROW, ADD, LOCK, SE), async ({ page }) => {
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await expect(handle(page, SE), 'one element: its handles').toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-page' } }).click();
  await expect(handle(page, SE), 'the page: none').toHaveCount(0);
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await control(page, ROW, { args: { target: 'n-intro' } }).click({ modifiers: ['Shift'] });
  await expect(handle(page, SE), 'several elements: none').toHaveCount(0);
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await control(page, LOCK, { args: { target: 'n-title' } }).click();
  await expect(handle(page, SE), 'a locked element: none').toHaveCount(0);
});
