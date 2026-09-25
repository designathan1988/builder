// drag-drop-inside beyond its scenarios (spec/behavior/drag-drop-inside.md, DESIGN.md "Canvas", drag): what the canvas
// draws while an element is dragged into a container (src/editor/canvas/chrome.tsx): an empty container outlined
// dashed with no line; a container with children at the slot of the pointer, with the line at that slot; the page
// root's own background as a receiver; and, over the dragged element's own subtree, the refusal (Problems in Pager
// 1): the receiver outlined in the danger colour, no line, the label saying why, and a release that changes nothing.
// The document, the selection and the history are read through the read-only test port; the drawing is measured
// against the elements' boxes inside the frame, mapped to the screen through its CSS zoom.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const interactions = JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: unknown }[] };
const THRESHOLD = interactions.constants.find((c) => c.id === 'drag.threshold')?.value as number;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
interface Port {
  readonly document: { pages: { tree: Tree }[] };
  readonly selection: string[];
  readonly undoSteps: number;
}

const port = (page: Page): Promise<Port> =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document() as Port['document'], selection: p.selection(), undoSteps: p.history().undoSteps };
  });
async function childrenOf(page: Page, id: string): Promise<string[]> {
  const find = (n: Tree): Tree | undefined => (n.id === id ? n : n.children.map(find).find((x) => x !== undefined));
  const tree = (await port(page)).document.pages[0]?.tree;
  return (tree === undefined ? undefined : find(tree))?.children.map((c) => c.id) ?? [];
}

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
}

// the screen box of a node's element through the frame's CSS zoom, and the zoom
function screenBox(page: Page, id: string): Promise<Box & { readonly zoom: number }> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const el = doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    const r = el.getBoundingClientRect();
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom, zoom };
  }, id);
}

// a screen point of the page's own background, below every element
function pageBackground(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    for (let y = doc.documentElement.clientHeight - 2; y > 0; y -= 4) {
      const hit = doc.elementFromPoint(vw / 2, y);
      if (hit === doc.documentElement || hit === doc.body) return { x: frame.left + (vw / 2) * zoom, y: frame.top + y * zoom };
    }
    throw new Error('no point of the page lies outside every element');
  });
}

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const near = (a: Box | null, b: Box) => a !== null && [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].every((d) => Math.abs(d) <= 1);
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const found = page.locator(selector);
  return (await found.count()) === 1 ? found.boundingBox() : null;
}

// presses at a point and starts the drag past drag.threshold
async function pressAndStart(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + THRESHOLD + 2, at.y + THRESHOLD + 2, { steps: 3 });
}

const DOORS = ['project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'element.moveTo#canvas-drag-canvas-element-inside', 'element.moveTo#canvas-drag-canvas-element-before-after'];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('over an empty container: it is outlined dashed as the receiver, no line, the label names it; the release puts the element in it', runs(...DOORS), async ({ page }) => {
  const actions = await screenBox(page, 'n-actions');
  await pressAndStart(page, centre(await screenBox(page, 'n-intro')));
  await page.mouse.move(centre(actions).x, centre(actions).y, { steps: 8 });
  const receiver = page.locator('[data-chrome="drop-receiver"]');
  await expect(receiver).toHaveAttribute('data-state', 'into');
  await expect.poll(() => boxOf(page, '[data-chrome="drop-receiver"]').then((b) => near(b, actions)), { message: 'Actions is outlined' }).toBe(true);
  expect(await receiver.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  await expect(page.locator('[data-chrome="drop-line"]')).toHaveCount(0);
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText('Drop in Actions · position 1 of 1');
  await page.mouse.up();
  expect(await childrenOf(page, 'n-actions')).toEqual(['n-intro']);
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
});

test('inside a container with children, at the slot of the pointer: the line lies at that slot; the page root\'s background takes a drop at its end', runs(...DOORS), async ({ page }) => {
  // Hero's top padding, past its 32 px edge band and above the Title: inside Hero, first
  const hero = await screenBox(page, 'n-hero');
  const title = await screenBox(page, 'n-title');
  const padding = { x: centre(hero).x, y: hero.y + 44 * hero.zoom };
  await pressAndStart(page, centre(await screenBox(page, 'n-actions')));
  await page.mouse.move(padding.x, padding.y, { steps: 8 });
  await expect(page.locator('[data-chrome="drop-receiver"]')).toHaveAttribute('data-state', 'between');
  await expect.poll(() => boxOf(page, '[data-chrome="drop-receiver"]').then((b) => near(b, hero)), { message: 'Hero is outlined' }).toBe(true);
  await expect.poll(async () => {
    const line = await boxOf(page, '[data-chrome="drop-line"]');
    return line !== null && Math.abs(line.y - title.y) <= 1;
  }, { message: 'the line lies at the top of Title' }).toBe(true);
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText('Drop in Hero · position 1 of 3');
  await page.mouse.up();
  expect(await childrenOf(page, 'n-hero')).toEqual(['n-actions', 'n-title', 'n-intro']);

  // the page's own background below the footer: inside the page root, last
  const background = await pageBackground(page);
  await pressAndStart(page, centre(await screenBox(page, 'n-title')));
  await page.mouse.move(background.x, background.y, { steps: 8 });
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText('Drop in Page · position 4 of 4');
  await page.mouse.up();
  expect(await childrenOf(page, 'n-page')).toEqual(['n-hero', 'n-plans', 'n-footer', 'n-title']);
  expect((await port(page)).undoSteps).toBe(2);
});

test('over the dragged element\'s own subtree: refused in the danger colour with no line, and the release changes nothing', runs(...DOORS), async ({ page }) => {
  // the empty Actions dragged over itself (a press on a container with children and a drag is a marquee:
  // marquee-select)
  const actions = await screenBox(page, 'n-actions');
  const before = (await port(page)).document;
  await pressAndStart(page, { x: centre(actions).x - 40, y: centre(actions).y - 3 });
  await page.mouse.move(centre(actions).x + 40, centre(actions).y, { steps: 8 });
  const receiver = page.locator('[data-chrome="drop-receiver"]');
  await expect(receiver).toHaveAttribute('data-state', 'refused');
  await expect.poll(() => boxOf(page, '[data-chrome="drop-receiver"]').then((b) => near(b, actions)), { message: 'Actions under the pointer is outlined' }).toBe(true);
  const danger = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--color-danger)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(await receiver.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(danger);
  await expect(page.locator('[data-chrome="drop-line"]')).toHaveCount(0);
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText('An element cannot be placed inside itself or one of its descendants.');
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.undoSteps).toBe(0);
  expect(after.selection).toEqual(['n-actions']);
  await expect(page.getByRole('status')).toHaveText('An element cannot be placed inside itself or one of its descendants.');
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
});

test('a container is dragged by its name label on the canvas; a press and drag on its own empty area is still a marquee', runs(...DOORS, 'selection.marquee#canvas-drag-empty-area-page-or-container'), async ({ page }) => {
  const hero = await screenBox(page, 'n-hero');
  const padding = { x: centre(hero).x, y: hero.y + 20 * hero.zoom };
  // clicked in its padding, Hero is selected and shows its label; pressed there and dragged below the Footer, it
  // lands last in the page
  await page.mouse.click(padding.x, padding.y);
  const label = page.locator('[data-chrome="label"][data-label-for="n-hero"]');
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (box === null) throw new Error('the hover label is not laid out');
  const background = await pageBackground(page);
  await pressAndStart(page, centre(box));
  await expect(page.locator('[data-chrome="band"]')).toHaveCount(0);
  await page.mouse.move(background.x, background.y, { steps: 8 });
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText('Drop in Page · position 3 of 3');
  await page.mouse.up();
  expect(await childrenOf(page, 'n-page')).toEqual(['n-plans', 'n-footer', 'n-hero']);
  const moved = await port(page);
  expect(moved.selection).toEqual(['n-hero']);
  expect(moved.undoSteps).toBe(1);

  // Hero's own padding pressed and dragged (its top-right corner, away from its label): a marquee, whose band is
  // drawn, and the document stays as it is
  const heroNow = await screenBox(page, 'n-hero');
  await pressAndStart(page, { x: heroNow.x + heroNow.width - 20 * heroNow.zoom, y: heroNow.y + 20 * heroNow.zoom });
  await page.mouse.move(centre(heroNow).x, centre(heroNow).y, { steps: 4 });
  await expect(page.locator('[data-chrome="band"]')).toHaveCount(1);
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await page.mouse.up();
  expect((await port(page)).document).toEqual(moved.document);
});
