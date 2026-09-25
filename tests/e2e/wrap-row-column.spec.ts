// wrap-row-column beyond its scenarios (spec/behavior/wrap-row-column.md; src/core/structure/wrap.ts): the Arrange
// menu's two items wrap as R and C do, each one undo step; C wraps an element its only child covers on the canvas,
// reached with ArrowUp from that child (spec select-click, "Nested elements"); R wraps several selected siblings in
// their order and refuses elements of different parents; a parent that accepts no <div> refuses the wrapper. The
// document, the selection and the history are read through the read-only test port, the wrapper's style inside the
// frame, the message in the status bar.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';

interface Tree {
  readonly id: string;
  readonly name: string;
  readonly children: readonly Tree[];
}
// the page's tree as names, the selection as names and the history's steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number; redoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const names = new Map<string, string>();
    const outline = (n: Tree): string => {
      names.set(n.id, n.name);
      return n.children.length === 0 ? n.name : `${n.name}(${n.children.map(outline).join(' ')})`;
    };
    const tree = outline(p.document().pages[0]?.tree as Tree);
    return { tree, selection: p.selection().map((id) => names.get(id) ?? id), undoSteps: p.history().undoSteps };
  });

// the computed display and flex-direction of the element drawn for the node of that name inside the frame
const flexOf = (page: Page, name: string) =>
  page.evaluate((wanted) => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] } }>).__builderTestPort;
    const find = (n: Tree): Tree | undefined => (n.name === wanted ? n : n.children.map(find).find((x) => x !== undefined));
    const node = p ? find(p.document().pages[0]?.tree as Tree) : undefined;
    const el = node ? document.querySelector<HTMLIFrameElement>('.frame__page')?.contentDocument?.querySelector(`[data-node="${node.id}"]`) : null;
    if (!el) return null;
    const style = getComputedStyle(el);
    return `${style.display} ${style.flexDirection}`;
  }, name);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
}

// a click at the centre of a node's element on the canvas, through the frame's CSS zoom, with a key held
async function clickNode(page: Page, id: string, key?: 'Shift') {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  if (key) await page.keyboard.down(key);
  await page.mouse.click(at.x, at.y);
  if (key) await page.keyboard.up(key);
}

const HERO = 'Hero(Title Intro Actions)';
const REST = 'Plans(Grid(CardA(CardATitle) CardB(CardBTitle) CardC) Perks(PerkOne(PerkOneText) PerkTwo(PerkTwoText))) Footer(Note)';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test(
  'Arrange › Wrap in a row and Wrap in a column wrap the selection as R and C do, one undo step each',
  runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'element.wrapRow#menu-arrange', 'element.wrapColumn#menu-arrange', 'history.undo#toolbar-top-bar'),
  async ({ page }) => {
    const status = page.getByRole('status');
    await clickNode(page, 'n-intro');
    await runDoor(page, 'element.wrapRow#menu-arrange');
    expect(await read(page)).toEqual({ tree: `Page(Hero(Title Row(Intro) Actions) ${REST})`, selection: ['Row'], undoSteps: 1 });
    await expect(status).toHaveText('Wrapped Intro in Row (display: flex; flex-direction: row).');
    await expect.poll(() => flexOf(page, 'Row')).toBe('flex row');

    await runDoor(page, 'history.undo#toolbar-top-bar');
    expect(await read(page)).toEqual({ tree: `Page(${HERO} ${REST})`, selection: ['Intro'], undoSteps: 0 });

    await runDoor(page, 'element.wrapColumn#menu-arrange');
    expect(await read(page)).toEqual({ tree: `Page(Hero(Title Column(Intro) Actions) ${REST})`, selection: ['Column'], undoSteps: 1 });
    await expect(status).toHaveText('Wrapped Intro in Column (display: flex; flex-direction: column).');
    await expect.poll(() => flexOf(page, 'Column')).toBe('flex column');
  },
);

test(
  'C wraps an element its only child covers on the canvas, reached with ArrowUp from that child',
  runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'selection.walkParent#key-arrow-up-in-canvas', 'element.wrapColumn#key-c-in-canvas', 'history.undo#toolbar-top-bar'),
  async ({ page }) => {
    await clickNode(page, 'n-card-b-title');
    await runDoor(page, 'selection.walkParent#key-arrow-up-in-canvas');
    expect((await read(page)).selection).toEqual(['CardB']);
    await runDoor(page, 'element.wrapColumn#key-c-in-canvas');
    const after = `Page(${HERO} Plans(Grid(CardA(CardATitle) Column(CardB(CardBTitle)) CardC) Perks(PerkOne(PerkOneText) PerkTwo(PerkTwoText))) Footer(Note))`;
    expect(await read(page)).toEqual({ tree: after, selection: ['Column'], undoSteps: 1 });
    await expect(page.getByRole('status')).toHaveText('Wrapped CardB in Column (display: flex; flex-direction: column).');
    await expect.poll(() => flexOf(page, 'Column')).toBe('flex column');
    await runDoor(page, 'history.undo#toolbar-top-bar');
    expect(await read(page)).toEqual({ tree: `Page(${HERO} ${REST})`, selection: ['CardB'], undoSteps: 0 });
  },
);

test(
  'R wraps several selected siblings in their document order, and refuses elements of different parents',
  runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'selection.add#canvas-click-element-shift', 'element.wrapRow#key-r-in-canvas'),
  async ({ page }) => {
    const status = page.getByRole('status');
    // Actions first, then Title: the Row holds them as the document orders them
    await clickNode(page, 'n-actions');
    await clickNode(page, 'n-title', 'Shift');
    await runDoor(page, 'element.wrapRow#key-r-in-canvas');
    expect(await read(page)).toEqual({ tree: `Page(Hero(Row(Title Actions) Intro) ${REST})`, selection: ['Row'], undoSteps: 1 });
    await expect(status).toHaveText('Wrapped 2 elements in Row (display: flex; flex-direction: row).');
    await expect.poll(() => flexOf(page, 'Row')).toBe('flex row');

    // Intro (in Hero) and Note (in Footer): refused, nothing changes
    await clickNode(page, 'n-intro');
    await clickNode(page, 'n-note', 'Shift');
    const before = await read(page);
    await runDoor(page, 'element.wrapRow#key-r-in-canvas');
    await expect(status).toHaveText('These elements must share a parent.');
    expect(await read(page)).toEqual(before);
  },
);

test(
  'a parent that accepts no <div> refuses the wrapper, and nothing changes',
  runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', 'selection.walkParent#key-arrow-up-in-canvas', 'element.wrapColumn#key-c-in-canvas'),
  async ({ page }) => {
    await clickNode(page, 'n-perk-one-text');
    await runDoor(page, 'selection.walkParent#key-arrow-up-in-canvas');
    const before = await read(page);
    expect(before.selection).toEqual(['PerkOne']);
    await runDoor(page, 'element.wrapColumn#key-c-in-canvas');
    await expect(page.getByRole('status')).toHaveText('Refused. <ul> only accepts <li>.');
    expect(await read(page)).toEqual(before);
  },
);
