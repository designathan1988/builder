// drag-level-keys-escape beyond its scenarios (spec/behavior/drag-level-keys-escape.md, Problems in Pager 1 to 3): a
// level key redraws the drop line and label at once, without a pointer move (src/editor/input/pointer.ts), and the
// label counts the levels actually climbed (src/editor/canvas/chrome.tsx); ArrowUp at the top is refused and the level
// stays, so one ArrowDown goes one level down from what is drawn (src/editor/drag/drag-session.ts); Escape takes every
// mark of the drag away at once and the release that follows changes nothing, the press's selection kept, also on a
// press still under drag.threshold; Escape during a marquee gives back the selection held before the press (spec
// marquee-select); a palette tile's creation drag climbs the same levels, and Escape on a tile press inserts nothing.
// The document, the selection and the history are read through the read-only test port; the drawing is measured
// against the elements' boxes inside the frame, mapped to the screen.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { control, door, keys, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const REORDER = 'element.moveTo#canvas-drag-canvas-element-before-after';
const MARQUEE = 'selection.marquee#canvas-drag-empty-area-page-or-container';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const PALETTE_DRAG = 'element.insert#canvas-drag-palette-tile-drop-proposal';
const UP = 'drag.levelUp#key-arrow-up-in-drag';
const DOWN = 'drag.levelDown#key-arrow-down-in-drag';
const CANCEL = 'drag.cancel#key-escape-in-drag';
const interactions = JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: unknown }[] };
const THRESHOLD = interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
if (typeof THRESHOLD !== 'number') throw new Error('interactions.json has no number drag.threshold');

// a shortcut door's chord as Playwright's keyboard presses it
const press = (page: Page, ref: string) => {
  const found = door(ref);
  if (found.chord === undefined) throw new Error(`${ref} has no chord`);
  return page.keyboard.press(keys(found.chord));
};

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface Point {
  readonly x: number;
  readonly y: number;
}
interface Tree {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly children: readonly Tree[];
}
const port = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document() as { pages: { tree: Tree }[] }, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
// a node's children in the document the port reads
async function childrenOf(page: Page, id: string): Promise<readonly Tree[]> {
  const find = (n: Tree): Tree | undefined => (n.id === id ? n : n.children.map(find).find((x) => x !== undefined));
  const tree = (await port(page)).document.pages[0]?.tree;
  return (tree === undefined ? undefined : find(tree))?.children ?? [];
}
const ids = async (page: Page, id: string) => (await childrenOf(page, id)).map((c) => c.id);

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
// a page point (the page's CSS pixels, not scrolled) on the screen
function screenPoint(page: Page, at: Point): Promise<Point> {
  return page.evaluate((p) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    if (!iframe) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const box = iframe.getBoundingClientRect();
    const style = getComputedStyle(iframe);
    const left = box.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * zoom;
    const top = box.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * zoom;
    return { x: left + p.x * zoom, y: top + p.y * zoom };
  }, at);
}
const centre = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const close = (a: number, b: number) => Math.abs(a - b) <= 1;
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const found = page.locator(selector);
  return (await found.count()) === 1 ? found.boundingBox() : null;
}
const label = (page: Page) => page.locator('[data-chrome="drop-label"]');
const status = (page: Page) => page.getByRole('status');

// the line lies across `receiver`, halfway between the bottom of `above` and the top of `below`
async function expectLine(page: Page, receiver: Box, above: Box, below: Box, message: string) {
  const y = (above.y + above.height + below.y) / 2;
  await expect
    .poll(async () => {
      const line = await boxOf(page, '[data-chrome="drop-line"]');
      return line !== null && close(line.y, y) && close(line.x, receiver.x) && close(line.width, receiver.width);
    }, { message })
    .toBe(true);
}

// the Heading pressed and dragged over the lower half of the Paragraph: after Intro in Hero, the pointer's own level
async function dragTitleAfterIntro(page: Page) {
  const title = centre(await screenBox(page, 'n-title'));
  const intro = await screenBox(page, 'n-intro');
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.mouse.move(title.x + (THRESHOLD as number) + 2, title.y + (THRESHOLD as number) + 2, { steps: 3 });
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 8 });
  await expect(label(page)).toHaveText('Drop in Hero · position 2 of 3');
}

// presses a tile and moves past drag.threshold, still over the palette
async function startTileDrag(page: Page, entry: string) {
  const tile = control(page, TILE, { args: { entry } });
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (box === null) throw new Error(`the tile of ${entry} is not laid out`);
  const at = centre(box);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + (THRESHOLD as number) + 2, at.y + (THRESHOLD as number) + 2, { steps: 3 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-door="${OPEN}"]`).click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-perk-two-text"]')).toHaveCount(1);
});

test('a level key redraws the line and the label at once, without a pointer move, the label counts the levels climbed, and the release drops at the level drawn', runs(OPEN, SELECT, REORDER, UP, DOWN), async ({ page }) => {
  const root = await screenBox(page, 'n-page');
  const hero = await screenBox(page, 'n-hero');
  const intro = await screenBox(page, 'n-intro');
  const actions = await screenBox(page, 'n-actions');
  const plans = await screenBox(page, 'n-plans');
  await dragTitleAfterIntro(page);
  await expectLine(page, hero, intro, actions, 'the line crosses Hero between Intro and Actions');

  // ArrowUp, the pointer still: after Hero, in the Page, one level climbed
  await press(page, UP);
  await expect(label(page)).toHaveText('Drop in Page · position 2 of 4 · ↑1');
  await expectLine(page, root, hero, plans, 'the line crosses the Page between Hero and Plans');
  await expect(status(page)).toHaveText('After Hero.');

  // ArrowDown, the pointer still: back after Intro, inside Hero
  await press(page, DOWN);
  await expect(label(page)).toHaveText('Drop in Hero · position 2 of 3');
  await expectLine(page, hero, intro, actions, 'the line crosses Hero between Intro and Actions again');
  await expect(status(page)).toHaveText('After Intro.');

  // up again and released there: the drop is the one drawn, Title selected, one undo step
  await press(page, UP);
  await expect(label(page)).toHaveText('Drop in Page · position 2 of 4 · ↑1');
  await page.mouse.up();
  expect(await ids(page, 'n-page')).toEqual(['n-hero', 'n-title', 'n-plans', 'n-footer']);
  const after = await port(page);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(1);
  await expect(status(page)).toHaveText('Moved Title to position 2 of 4 in Page.');
});

test('ArrowUp at the top level is refused and the level stays, so the label still counts one level and one ArrowDown goes back to the pointer\'s own', runs(OPEN, SELECT, REORDER, UP, DOWN), async ({ page }) => {
  await dragTitleAfterIntro(page);
  const before = (await port(page)).document;
  await press(page, UP);
  await expect(label(page)).toHaveText('Drop in Page · position 2 of 4 · ↑1');
  // the Page is the top: refused twice, nothing changes and the label still says one level
  await press(page, UP);
  await expect(status(page)).toHaveText('Already at the top level.');
  await press(page, UP);
  await expect(status(page)).toHaveText('Already at the top level.');
  await expect(label(page)).toHaveText('Drop in Page · position 2 of 4 · ↑1');
  expect((await port(page)).document).toEqual(before);
  // one ArrowDown: back at the pointer's own level, and the release drops there
  await press(page, DOWN);
  await expect(label(page)).toHaveText('Drop in Hero · position 2 of 3');
  await page.mouse.up();
  expect(await ids(page, 'n-hero')).toEqual(['n-intro', 'n-title', 'n-actions']);
  expect((await port(page)).undoSteps).toBe(1);
});

test('Escape takes every mark of the drag away at once, and the release that follows changes nothing; the press\'s selection stays', runs(OPEN, SELECT, REORDER, CANCEL), async ({ page }) => {
  const before = (await port(page)).document;
  await dragTitleAfterIntro(page);
  // the dragged selection is drawn as the drag's source
  expect(await page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  await press(page, CANCEL);
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');
  // the element is drawn as selected again, not as a source
  await expect.poll(() => page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  // the pointer moves on and lets go: nothing is drawn, nothing moves, no undo step
  const actions = await screenBox(page, 'n-actions');
  await page.mouse.move(centre(actions).x, actions.y + actions.height * 0.75, { steps: 6 });
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(0);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');
});

test('Escape on a press still under drag.threshold starts no drag: moving on draws nothing and the release changes nothing', runs(OPEN, SELECT, CANCEL), async ({ page }) => {
  const before = (await port(page)).document;
  const title = centre(await screenBox(page, 'n-title'));
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await press(page, CANCEL);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');
  const intro = await screenBox(page, 'n-intro');
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 8 });
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(0);
});

test('Escape during a marquee takes the band away and gives back the selection held before the press', runs(OPEN, SELECT, MARQUEE, CANCEL), async ({ page }) => {
  // Intro selected, then a band from Hero's top-left padding to the middle of Intro, which takes Title and Intro
  const intro = await screenPoint(page, { x: 720, y: 153 });
  await page.mouse.click(intro.x, intro.y);
  expect((await port(page)).selection).toEqual(['n-intro']);
  const start = await screenPoint(page, { x: 20, y: 20 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(intro.x, intro.y, { steps: 8 });
  await expect(page.locator('[data-chrome="band"]')).toHaveCount(1);
  expect((await port(page)).selection).toEqual(['n-title', 'n-intro']);
  await press(page, CANCEL);
  await expect(page.locator('[data-chrome="band"]')).toHaveCount(0);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');
  expect((await port(page)).selection).toEqual(['n-intro']);
  await page.mouse.up();
  const after = await port(page);
  expect(after.selection).toEqual(['n-intro']);
  expect(after.undoSteps).toBe(0);
});

test('a tile\'s creation drag climbs the same levels, and its release inserts at the level drawn', runs(OPEN, INSERT_PANEL, PALETTE_DRAG, UP), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  const intro = await screenBox(page, 'n-intro');
  await startTileDrag(page, 'heading');
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 12 });
  await expect(label(page)).toHaveText('Insert Heading · position 3 of 4 in Hero');
  await press(page, UP);
  await expect(label(page)).toHaveText('Insert Heading · position 2 of 4 in Page · ↑1');
  await expect(status(page)).toHaveText('Insert Heading · position 2 of 4 in Page · ↑1');
  await page.mouse.up();
  const kids = await childrenOf(page, 'n-page');
  expect(kids.map((c) => `${c.type} ${c.name}`)).toEqual(['section Hero', 'heading Heading', 'section Plans', 'footer Footer']);
  const after = await port(page);
  expect(after.selection).toEqual([kids[1]?.id]);
  expect(after.undoSteps).toBe(1);
});

test('Escape during a tile\'s creation drag sends its ghost back to the tile over 150 to 250 ms, fading, and then it is gone; nothing is inserted', runs(OPEN, INSERT_PANEL, PALETTE_DRAG, CANCEL), async ({ page }) => {
  const bound = (id: string) => interactions.constants.find((c) => c.id === id)?.value;
  const [min, max] = [bound('drag.cancelReturnMin'), bound('drag.cancelReturnMax')];
  if (typeof min !== 'number' || typeof max !== 'number') throw new Error('interactions.json has no cancel return bounds');
  const offset = interactions.constants.find((c) => c.id === 'drag.ghostOffset')?.value as [number, number];
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await runDoor(page, INSERT_PANEL);
  const before = (await port(page)).document;
  // the browser plays every animation ten times slower, so the way back can be watched frame by frame
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });

  const tile = control(page, TILE, { args: { entry: 'paragraph' } });
  await tile.scrollIntoViewIfNeeded();
  const tileBox = await tile.boundingBox();
  if (tileBox === null) throw new Error('the tile of paragraph is not laid out');
  const pressed = centre(tileBox);
  await startTileDrag(page, 'paragraph');
  const intro = await screenBox(page, 'n-intro');
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 12 });
  const ghost = page.locator('[data-chrome="ghost"]');
  await expect(ghost).toHaveCount(1);
  const home = { x: pressed.x + offset[0], y: pressed.y + offset[1] };
  const away = await ghost.boundingBox();
  if (away === null) throw new Error('the ghost is not laid out');
  const distance = (b: Box) => Math.hypot(b.x - home.x, b.y - home.y);

  await press(page, CANCEL);
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  // the ghost stays, animated for 150 to 250 ms towards where the press went down on the tile, fading
  await expect
    .poll(() => ghost.evaluate((el) => el.getAnimations().map((a) => Number((a.effect as KeyframeEffect).getTiming().duration))), { message: 'the ghost goes back in one animation' })
    .toHaveLength(1);
  const [duration] = await ghost.evaluate((el) => el.getAnimations().map((a) => Number((a.effect as KeyframeEffect).getTiming().duration)));
  expect(duration).toBeGreaterThanOrEqual(min);
  expect(duration).toBeLessThanOrEqual(max);
  // measured every 50 ms while it plays (two seconds at a tenth of the speed): nearer the tile, and fading
  await expect
    .poll(
      async () => {
        const now = await boxOf(page, '[data-chrome="ghost"]');
        const opacity = await page.evaluate(() => {
          const el = document.querySelector('[data-chrome="ghost"]');
          return el === null ? 1 : Number(getComputedStyle(el).opacity);
        });
        return now !== null && distance(now) < distance(away) / 2 && opacity < 1;
      },
      { message: 'the ghost comes back towards the tile, fading', intervals: [50] },
    )
    .toBe(true);
  // then it is drawn no more, and the release inserts nothing
  await expect(ghost).toHaveCount(0, { timeout: 10_000 });
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.undoSteps).toBe(0);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');

  // asked for reduced motion, the ghost goes at once, however slow the animations play
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startTileDrag(page, 'paragraph');
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 12 });
  await expect(ghost).toHaveCount(1);
  await press(page, CANCEL);
  await expect(ghost).toHaveCount(0, { timeout: 500 });
  await page.mouse.up();
  expect((await port(page)).document).toEqual(before);
});

test('Escape on a tile press under drag.threshold inserts nothing, at once or at the release', runs(OPEN, INSERT_PANEL, CANCEL), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  const before = (await port(page)).document;
  const tile = control(page, TILE, { args: { entry: 'paragraph' } });
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (box === null) throw new Error('the tile of paragraph is not laid out');
  await page.mouse.move(centre(box).x, centre(box).y);
  await page.mouse.down();
  await press(page, CANCEL);
  await expect(status(page)).toHaveText('Drag cancelled — nothing changed.');
  expect((await port(page)).document).toEqual(before);
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.undoSteps).toBe(0);
});
