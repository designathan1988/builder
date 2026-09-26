// The drop indicator in two dimensions beyond the scenarios (spec drag-reorder-canvas, Problems in Pager 5; the user's
// real-use audit, item 2.1): in a grid of two columns and two rows of 120 px, a tile held in the gap between the first two cards
// draws its insertion line down between them, across their row only (never across the second row), and lands between
// them; in a row-reverse flex, a tile held just inside the right edge of the first card (before it in the document,
// drawn to its right) draws its line at that right edge and lands first. The drawing is measured against the cards'
// boxes on the screen; the document is read through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const DISPLAY = 'style.set#inspector-display';
const COLUMNS = 'style.set#inspector-grid-template-columns';
const ROWS = 'style.set#inspector-grid-template-rows';
const GAP = 'style.set#inspector-gap';
const DIRECTION = 'style.set#inspector-flex-direction';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const PALETTE_DRAG = 'element.insert#canvas-drag-palette-tile-drop-proposal';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface Tree {
  readonly id: string;
  readonly name: string;
  readonly children: readonly Tree[];
}

async function type(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
// the names of the grid's children in the document the port reads
async function gridChildren(page: Page): Promise<readonly string[]> {
  const doc = (await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document())) as { pages: { tree: Tree }[] };
  const find = (n: Tree): Tree | undefined => (n.id === 'n-grid' ? n : n.children.map(find).find((x) => x !== undefined));
  const tree = doc.pages[0]?.tree;
  return (tree === undefined ? undefined : find(tree))?.children.map((c) => c.name) ?? [];
}
// the screen box of a node's element: its box in the frame, through the frame's content box and CSS zoom
function screenBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const style = getComputedStyle(iframe);
    const left = frame.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * zoom;
    const top = frame.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * zoom;
    const el = doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    const r = el.getBoundingClientRect();
    return { x: left + r.left * zoom, y: top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  }, id);
}
// the drawn insertion line, or null while there is not exactly one
async function dropLine(page: Page): Promise<Box | null> {
  const boxes = await page.locator('[data-chrome="drop-line"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as Box));
  return boxes.length === 1 ? (boxes[0] ?? null) : null;
}
// presses the paragraph tile and moves the pointer to a point of the page in steps, the button held
async function holdTileAt(page: Page, at: { readonly x: number; readonly y: number }): Promise<void> {
  const tile = control(page, TILE, { args: { entry: 'paragraph' } });
  const box = await tile.boundingBox();
  if (box === null) throw new Error('the paragraph tile is not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 3 });
  await page.mouse.move(at.x, at.y, { steps: 12 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-grid' } }).click();
});

test('in a grid the line stands down between the two cards, across their row only, and the tile lands between them', runs(OPEN, ROW, DISPLAY, COLUMNS, ROWS, GAP, INSERT_PANEL, PALETTE_DRAG), async ({ page }) => {
  await type(page, DISPLAY, 'grid');
  await type(page, COLUMNS, 'repeat(2, 1fr)');
  // rows tall enough that the middle of the first lies past the grid's own edge band (drag-drop-inside, "Hit zones")
  await type(page, ROWS, 'repeat(2, 120px)');
  await type(page, GAP, '40px');
  await runDoor(page, INSERT_PANEL);
  const [a, b, c] = [await screenBox(page, 'n-card-a'), await screenBox(page, 'n-card-b'), await screenBox(page, 'n-card-c')];
  expect(c.y).toBeGreaterThan(a.y + a.height);
  await holdTileAt(page, { x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 });
  await expect
    .poll(async () => {
      const line = await dropLine(page);
      if (line === null) return 'no line';
      const x = line.x + line.width / 2;
      return { between: x >= a.x + a.width && x <= b.x, down: line.height > line.width, rowOnly: line.y >= a.y - 2 && line.y + line.height <= a.y + a.height + 2 };
    })
    .toEqual({ between: true, down: true, rowOnly: true });
  await page.mouse.up();
  await expect.poll(() => gridChildren(page)).toEqual(['CardA', 'Paragraph', 'CardB', 'CardC']);
});

test('in a row-reverse flex, before the first card is drawn at its right edge, and the tile lands first', runs(OPEN, ROW, DISPLAY, DIRECTION, INSERT_PANEL, PALETTE_DRAG), async ({ page }) => {
  await type(page, DISPLAY, 'flex');
  await control(page, DIRECTION, { args: { property: 'flex-direction', value: 'row-reverse' } }).click();
  await runDoor(page, INSERT_PANEL);
  const a = await screenBox(page, 'n-card-a');
  const b = await screenBox(page, 'n-card-b');
  expect(b.x).toBeLessThan(a.x);
  await holdTileAt(page, { x: a.x + a.width - 3, y: a.y + a.height / 2 });
  await expect
    .poll(async () => {
      const line = await dropLine(page);
      return line === null ? 'no line' : Math.abs(line.x + line.width / 2 - (a.x + a.width)) <= 2;
    })
    .toBe(true);
  await page.mouse.up();
  await expect.poll(() => gridChildren(page)).toEqual(['Paragraph', 'CardA', 'CardB', 'CardC']);
});
