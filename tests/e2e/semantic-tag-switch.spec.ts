// semantic-tag-switch beyond its scenarios (spec/behavior/semantic-tag-switch.md): the Settings tab's HTML tag field
// shows the element's tag and suggests its equivalent tags (elements.json), and an element with no equivalent tag has
// no such field; a tag kept with Enter changes only the node's tag and the canvas draws the new element around the same
// children, undo and redo giving back each tag and the selection; leaving the field (Tab, a click on the canvas) keeps
// what was typed; a refused tag and an emptied field leave the document as it was and the field shows the element's
// tag again; a kept tag survives an immediate reload and the canvas draws it (Problems in Pager 1, 2, 5, 6). The
// document, the selection and the history are read through the read-only test port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const PAGE_PROPERTIES = 'page.openProperties#inspector-page-properties-button';
const TAG = 'element.setTag#inspector-tag';
const UNDO = 'history.undo#toolbar-top-bar';
const REDO = 'history.redo#toolbar-top-bar';

const EN = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
const ELEMENTS = JSON.parse(fs.readFileSync('manifest/elements.json', 'utf8')) as { elements: { id: string; tag: string | null; alternativeTags: string[] }[] };
const words = (key: string, params: Record<string, string> = {}) => (EN[key] ?? '').replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '');
// the tags an element of a type may take: its own and its alternative tags, each once
const equivalentOf = (type: string) => {
  const element = ELEMENTS.elements.find((e) => e.id === type);
  return [...new Set([element?.tag ?? '', ...(element?.alternativeTags ?? [])])];
};

interface Tree {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly tag: string | null;
  readonly children: readonly Tree[];
}
const port = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const find = (tree: Tree, id: string): Tree | null => (tree.id === id ? tree : tree.children.map((c) => find(c, id)).find((n) => n !== null) ?? null);
// a node as the port reads it
const nodeOf = async (page: Page, id: string) => {
  const tree = (await port(page)).document.pages[0]?.tree;
  const found = tree === undefined ? null : find(tree, id);
  if (found === null) throw new Error(`the document has no node ${id}`);
  return found;
};
const tagOf = async (page: Page, id: string) => (await nodeOf(page, id)).tag;
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
// the element the canvas draws for a node: its tag, the nodes of its child elements, and a computed style
const frameTag = (page: Page, id: string) => drawn(page, id).evaluate((el) => el.localName);
const frameChildren = (page: Page, id: string) => drawn(page, id).evaluate((el) => [...el.children].map((c) => c.getAttribute('data-node')));
const computed = (page: Page, id: string, property: string) => drawn(page, id).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
const status = (page: Page) => page.getByRole('status');
const field = (page: Page) => control(page, TAG).locator('input');

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-door="${OPEN}"]`).click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

// a click on the centre of a node's element on the canvas, which selects it
async function select(page: Page, id: string) {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await port(page)).selection).toEqual([id]);
}

// a node selected on the canvas, then the Settings tab, with its HTML tag field showing the node's tag
async function tagFieldOf(page: Page, id: string) {
  await select(page, id);
  await runDoor(page, SETTINGS);
  await expect(field(page)).toHaveValue((await tagOf(page, id)) ?? '');
}

// types into the field as a person does: a click on it, everything it holds selected, then the text (an empty text
// deletes what it holds)
async function typeTag(page: Page, text: string) {
  await field(page).click();
  await page.keyboard.press('Control+A');
  if (text === '') await page.keyboard.press('Backspace');
  else await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test("the HTML tag field shows the element's tag and suggests its equivalent tags; an element with no equivalent tag has none", runs(OPEN, SELECT, SETTINGS, TAG, PAGE_PROPERTIES), async ({ page }) => {
  await openAurora(page);
  const suggested = () => field(page).evaluate((input: HTMLInputElement) => [...(input.list?.options ?? [])].map((o) => o.value));
  for (const [id, type] of [
    ['n-hero', 'section'],
    ['n-title', 'heading'],
    ['n-intro', 'paragraph'],
  ] as const) {
    await tagFieldOf(page, id);
    await expect(field(page)).toBeEnabled();
    expect(await suggested(), `${id} suggests the equivalent tags of ${type}`).toEqual(equivalentOf(type));
  }
  // the page root (<body>) has no equivalent tag: its Settings tab has no HTML tag field
  await runDoor(page, PAGE_PROPERTIES);
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-page']);
  await expect(page.locator('[data-region="inspector-settings"] input').first()).toBeVisible();
  await expect(control(page, TAG)).toHaveCount(0);
});

test('a tag kept with Enter changes only the tag, the canvas draws the new element around the same children, and undo and redo give back each tag and the selection', runs(OPEN, SELECT, SETTINGS, TAG, UNDO, REDO), async ({ page }) => {
  await openAurora(page);
  await tagFieldOf(page, 'n-hero');
  const before = await nodeOf(page, 'n-hero');
  const children = await frameChildren(page, 'n-hero');
  expect(await frameTag(page, 'n-hero')).toBe('section');
  await typeTag(page, 'article');
  // typing changes only the field
  expect(await tagOf(page, 'n-hero')).toBe('section');
  await page.keyboard.press('Enter');
  await expect.poll(() => tagOf(page, 'n-hero')).toBe('article');
  expect(await nodeOf(page, 'n-hero')).toEqual({ ...before, tag: 'article' });
  await expect(status(page)).toHaveText(words('status.tag.set', { name: 'Hero', tag: '<article>' }));
  await expect.poll(() => frameTag(page, 'n-hero')).toBe('article');
  expect(await frameChildren(page, 'n-hero')).toEqual(children);
  expect(await computed(page, 'n-hero', 'padding-top')).toBe('56px');
  expect((await port(page)).undoSteps).toBe(1);
  // Enter again with the same text records nothing
  await page.keyboard.press('Enter');
  expect((await port(page)).undoSteps).toBe(1);
  // a second switch is a second undo step
  await typeTag(page, 'header');
  await page.keyboard.press('Enter');
  await expect.poll(() => frameTag(page, 'n-hero')).toBe('header');
  expect((await port(page)).undoSteps).toBe(2);
  await select(page, 'n-intro');
  await runDoor(page, UNDO);
  await expect.poll(() => frameTag(page, 'n-hero')).toBe('article');
  expect(await tagOf(page, 'n-hero')).toBe('article');
  expect((await port(page)).selection).toEqual(['n-hero']);
  await runDoor(page, UNDO);
  await expect.poll(() => frameTag(page, 'n-hero')).toBe('section');
  expect(await nodeOf(page, 'n-hero')).toEqual(before);
  await runDoor(page, REDO);
  await runDoor(page, REDO);
  await expect.poll(() => frameTag(page, 'n-hero')).toBe('header');
  expect(await frameChildren(page, 'n-hero')).toEqual(children);
});

test('leaving the field keeps the typed tag, with Tab or a click on the canvas, and the canvas draws the heading at its new level', runs(OPEN, SELECT, SETTINGS, TAG), async ({ page }) => {
  await openAurora(page);
  await tagFieldOf(page, 'n-title');
  const h1Size = await computed(page, 'n-title', 'font-size');
  await typeTag(page, 'H4');
  await page.keyboard.press('Tab');
  await expect.poll(() => tagOf(page, 'n-title')).toBe('h4');
  await expect.poll(() => frameTag(page, 'n-title')).toBe('h4');
  expect(await computed(page, 'n-title', 'font-size')).toBe('16px');
  expect(h1Size).not.toBe('16px');
  expect((await nodeOf(page, 'n-title')).type).toBe('heading');
  await typeTag(page, 'h5');
  await select(page, 'n-intro');
  await expect.poll(() => tagOf(page, 'n-title')).toBe('h5');
  await expect.poll(() => frameTag(page, 'n-title')).toBe('h5');
  expect((await port(page)).undoSteps).toBe(2);
});

test("a refused tag and an emptied field leave the document as it was, and the field shows the element's tag again", runs(OPEN, SELECT, SETTINGS, TAG), async ({ page }) => {
  await openAurora(page);
  await tagFieldOf(page, 'n-hero');
  await typeTag(page, 'p');
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText(words('status.tag.notEquivalent', { tag: '<p>', name: 'Hero' }));
  await expect(field(page)).toHaveValue('section');
  expect(await tagOf(page, 'n-hero')).toBe('section');
  expect(await frameTag(page, 'n-hero')).toBe('section');
  expect((await port(page)).undoSteps).toBe(0);
  // leaving the field then keeps nothing new
  await page.keyboard.press('Tab');
  expect((await port(page)).undoSteps).toBe(0);
  // an emptied field: the element keeps its tag, the status bar names it, the field shows it again
  await typeTag(page, '');
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText(words('status.tag.set', { name: 'Hero', tag: '<section>' }));
  await expect(field(page)).toHaveValue('section');
  expect(await tagOf(page, 'n-hero')).toBe('section');
  expect((await port(page)).undoSteps).toBe(0);
});

test('a kept tag survives an immediate reload and the canvas draws it', runs(OPEN, SELECT, SETTINGS, TAG), async ({ page }) => {
  await openAurora(page);
  await tagFieldOf(page, 'n-intro');
  await typeTag(page, 'pre');
  await page.keyboard.press('Enter');
  await expect.poll(() => frameTag(page, 'n-intro')).toBe('pre');
  expect(await computed(page, 'n-intro', 'font-family')).toBe('monospace');
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
  const intro = await nodeOf(page, 'n-intro');
  expect([intro.type, intro.tag]).toEqual(['paragraph', 'pre']);
  expect(await frameTag(page, 'n-intro')).toBe('pre');
  expect(await computed(page, 'n-intro', 'font-family')).toBe('monospace');
});
