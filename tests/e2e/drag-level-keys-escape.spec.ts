// drag-level-keys-escape beyond its scenarios (spec/behavior/drag-level-keys-escape.md, Problems in Pager 1 to 3): a
// level key redraws the drop line and label at once, without a pointer move, and the label counts the levels actually
// climbed; ArrowUp at the top is refused and the level stays, so one ArrowDown goes one level down from what is drawn;
// Escape removes every mark of the drag at once and the release drops nothing; Escape on a press still under
// drag.threshold starts no drag at all. The document, the selection and the history are read through the read-only
// test port; the drawing is measured against the elements' boxes inside the frame, mapped to the screen.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { keys, openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const interactions = JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: unknown }[] };
const THRESHOLD = interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
if (typeof THRESHOLD !== 'number') throw new Error('no number drag.threshold');
const EN = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
const say = (key: string, params: Record<string, string | number> = {}) => (EN[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));

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

// the screen box of a node's element, through the frame's CSS zoom
function screenBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const el = doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    const r = el.getBoundingClientRect();
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  }, id);
}
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
async function lineY(page: Page): Promise<number | null> {
  const found = page.locator('[data-chrome="drop-line"]');
  return (await found.count()) === 1 ? ((await found.boundingBox())?.y ?? null) : null;
}

// the Heading pressed and dragged over the lower half of the Paragraph: "after Intro" in Hero, level 0
async function dragTitleAfterIntro(page: Page) {
  const title = centre(await screenBox(page, 'n-title'));
  const intro = await screenBox(page, 'n-intro');
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.mouse.move(title.x + THRESHOLD + 2, title.y + THRESHOLD + 2, { steps: 3 });
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 8 });
  await expect(page.locator('[data-chrome="drop-label"]')).toHaveText(say('canvas.dropTarget', { parent: 'Hero', position: 2, count: 3 }));
}

const DRAG = ['project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'element.moveTo#canvas-drag-canvas-element-before-after'];
const UP = 'drag.levelUp#key-arrow-up-in-drag';
const DOWN = 'drag.levelDown#key-arrow-down-in-drag';
const CANCEL = 'drag.cancel#key-escape-in-drag';
const chord = (ref: string) => {
  const d = JSON.parse(fs.readFileSync('manifest/commands/structure.json', 'utf8')) as { commands: { id: string; entryPoints: { id: string; chord?: string }[] }[] };
  const [command, id] = ref.split('#');
  const found = d.commands.find((c) => c.id === command)?.entryPoints.find((e) => e.id === id)?.chord;
  if (found === undefined) throw new Error(`${ref} has no chord`);
  return keys(found);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
});

test('a level key redraws the line and the label at once, without a pointer move, and the label counts the levels climbed', runs(...DRAG, UP, DOWN), async ({ page }) => {
  await dragTitleAfterIntro(page);
  const hero = await screenBox(page, 'n-hero');
  const label = page.locator('[data-chrome="drop-label"]');

  // ArrowUp, the pointer still: after Hero, in the Page, one level climbed
  await page.keyboard.press(chord(UP));
  await expect(label).toHaveText(say('canvas.dropTargetLevel', { parent: 'Page', position: 2, count: 4, levels: 1 }));
  await expect.poll(async () => {
    const y = await lineY(page);
    return y !== null && y >= hero.y + hero.height - 2;
  }, { message: 'the line lies below Hero' }).toBe(true);
  await expect(page.getByRole('status')).toHaveText(say('status.drop.after', { name: 'Hero' }));

  // ArrowDown, the pointer still: back after Intro, inside Hero
  await page.keyboard.press(chord(DOWN));
  await expect(label).toHaveText(say('canvas.dropTarget', { parent: 'Hero', position: 2, count: 3 }));
  await expect.poll(async () => {
    const y = await lineY(page);
    return y !== null && y < hero.y + hero.height - 2;
  }, { message: 'the line lies inside Hero again' }).toBe(true);
  await expect(page.getByRole('status')).toHaveText(say('status.drop.after', { name: 'Intro' }));

  // up again and released: the drop is the one drawn, one undo step
  await page.keyboard.press(chord(UP));
  await page.mouse.up();
  expect(await childrenOf(page, 'n-page')).toEqual(['n-hero', 'n-title', 'n-plans', 'n-footer']);
  expect((await port(page)).undoSteps).toBe(1);
});

test('ArrowUp at the top level is refused and the level stays, so one ArrowDown goes one level down from what is drawn', runs(...DRAG, UP, DOWN), async ({ page }) => {
  await dragTitleAfterIntro(page);
  const label = page.locator('[data-chrome="drop-label"]');
  const before = (await port(page)).document;
  await page.keyboard.press(chord(UP));
  await expect(label).toHaveText(say('canvas.dropTargetLevel', { parent: 'Page', position: 2, count: 4, levels: 1 }));
  // the Page is the top: refused, nothing changes and the label still says one level
  await page.keyboard.press(chord(UP));
  await expect(page.getByRole('status')).toHaveText(say('status.drop.topLevel'));
  await page.keyboard.press(chord(UP));
  await expect(label).toHaveText(say('canvas.dropTargetLevel', { parent: 'Page', position: 2, count: 4, levels: 1 }));
  expect((await port(page)).document).toEqual(before);
  // one ArrowDown: back at the pointer's own level
  await page.keyboard.press(chord(DOWN));
  await expect(label).toHaveText(say('canvas.dropTarget', { parent: 'Hero', position: 2, count: 3 }));
  await page.mouse.up();
  expect(await childrenOf(page, 'n-hero')).toEqual(['n-intro', 'n-title', 'n-actions']);
});

test('Escape removes every mark of the drag at once, and the release that follows drops nothing', runs(...DRAG, CANCEL), async ({ page }) => {
  const before = (await port(page)).document;
  await dragTitleAfterIntro(page);
  await page.keyboard.press(chord(CANCEL));
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText(say('status.drag.cancelled'));
  // the dragged element is drawn as selected again, not as a source
  await expect.poll(() => page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  // the pointer moves on and lets go: nothing is drawn, nothing moves, no undo step; the press's selection stays
  const actions = await screenBox(page, 'n-actions');
  await page.mouse.move(centre(actions).x, actions.y + actions.height * 0.75, { steps: 6 });
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(0);
  await expect(page.getByRole('status')).toHaveText(say('status.drag.cancelled'));
});

test('Escape on a press still under drag.threshold starts no drag: moving on draws nothing and the release drops nothing', runs(...DRAG.slice(0, 2), CANCEL), async ({ page }) => {
  const before = (await port(page)).document;
  const title = centre(await screenBox(page, 'n-title'));
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.keyboard.press(chord(CANCEL));
  await expect(page.getByRole('status')).toHaveText(say('status.drag.cancelled'));
  const intro = await screenBox(page, 'n-intro');
  await page.mouse.move(centre(intro).x, intro.y + intro.height * 0.75, { steps: 8 });
  await expect(page.locator('[data-chrome="drop"]')).toHaveCount(0);
  await page.mouse.up();
  const after = await port(page);
  expect(after.document).toEqual(before);
  expect(after.selection).toEqual(['n-title']);
  expect(after.undoSteps).toBe(0);
});
