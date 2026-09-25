// multi-select-click beyond its scenarios (spec/behavior/multi-select-click.md, DESIGN.md "Canvas", multi): what the
// canvas draws while several elements are selected (src/editor/canvas/chrome.tsx): each one's own outline, the
// dashed outline of their union and one label counting them, over no text; and that a Shift+click on the page root
// adds nothing (the door's target is an element). The selection is read through the read-only test port; the
// outlines are measured against the elements' boxes inside the frame, mapped to the screen through its CSS zoom.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const selection = (page: Page) => page.evaluate(() => (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort?.selection());

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
}

// the screen box of a node's element, through the frame's CSS zoom, or of the frame's whole page (null)
function screenBox(page: Page, id: string | null): Promise<Box> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    if (node === null) return { x: frame.left, y: frame.top, width: frame.width, height: frame.height };
    const el = doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    const r = el.getBoundingClientRect();
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  }, id);
}

// the screen boxes of every run of text on the page
function textBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      if ((text.textContent ?? '').trim() === '') continue;
      const range = doc.createRange();
      range.selectNodeContents(text);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) boxes.push({ x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom });
    }
    return boxes;
  });
}

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const near = (a: Box, b: Box) => [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].every((d) => Math.abs(d) <= 1);
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  const found = page.locator(selector);
  const boxes: Box[] = [];
  for (let i = 0; i < (await found.count()); i += 1) {
    const box = await found.nth(i).boundingBox();
    if (box !== null) boxes.push(box);
  }
  return boxes;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test(
  'several selected: each element has its own outline, their union is outlined dashed, one label counts them over no text; back to one, the label names it',
  runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'selection.add#canvas-click-element-shift', 'selection.toggle#canvas-click-element-ctrl'),
  async ({ page }) => {
    await openAurora(page);
    const title = await screenBox(page, 'n-title');
    await page.mouse.click(centre(title).x, centre(title).y);
    const card = await screenBox(page, 'n-card-a-title');
    await page.keyboard.down('Shift');
    await page.mouse.click(centre(card).x, centre(card).y);
    await page.keyboard.up('Shift');
    expect(await selection(page)).toEqual(['n-title', 'n-card-a-title']);

    // one outline on each selected element
    await expect.poll(async () => (await boxesOf(page, '[data-chrome="selection"]')).map((b) => near(b, title) || near(b, card)), { message: 'an outline on each element' }).toEqual([true, true]);
    // the union of the two, dashed
    const around = union(title, card);
    await expect.poll(async () => (await boxesOf(page, '[data-chrome="union"]')).map((b) => near(b, around)), { message: 'the union is outlined' }).toEqual([true]);
    expect(await page.locator('[data-chrome="union"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
    // one label, counting them, over no text of the page
    const label = page.locator('[data-chrome="label"]');
    await expect(label).toHaveCount(1);
    await expect(label).toHaveText('2 elements selected');
    await expect(label).toHaveAttribute('data-placement', /above|inside|below/);
    const labelBox = await label.boundingBox();
    if (labelBox === null) throw new Error('the label is not laid out');
    expect((await textBoxes(page)).filter((t) => overlaps(labelBox, t)), 'the label covers no text').toEqual([]);

    // Ctrl+click takes the card title out: one outline, no union, the label names the title and its tag
    await page.keyboard.down('Control');
    await page.mouse.click(centre(card).x, centre(card).y);
    await page.keyboard.up('Control');
    expect(await selection(page)).toEqual(['n-title']);
    await expect(page.locator('[data-chrome="union"]')).toHaveCount(0);
    await expect(label).toHaveText(/Title\s*h1/);
    await expect.poll(async () => (await boxesOf(page, '[data-chrome="selection"]')).map((b) => near(b, title)), { message: 'the outline is on the title alone' }).toEqual([true]);
  },
);

test('a Shift+click on empty page area adds nothing: the page root is never added', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'selection.add#canvas-click-element-shift'), async ({ page }) => {
  await openAurora(page);
  const title = await screenBox(page, 'n-title');
  await page.mouse.click(centre(title).x, centre(title).y);
  // a point of the page that no element covers: the bottom of the frame, below the footer
  const frame = await screenBox(page, null);
  const empty = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frameBox = iframe.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    for (let y = vh - 2; y > 0; y -= 4) {
      const hit = doc.elementFromPoint(vw / 2, y);
      if (hit === doc.documentElement || hit === doc.body) return { x: frameBox.left + (vw / 2) * zoom, y: frameBox.top + y * zoom };
    }
    return null;
  });
  if (empty === null) throw new Error(`no point of the page (${JSON.stringify(frame)}) lies outside every element`);
  await page.keyboard.down('Shift');
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.up('Shift');
  expect(await selection(page)).toEqual(['n-title']);
  await expect(page.locator('[data-chrome="selection"]')).toHaveCount(1);
});
