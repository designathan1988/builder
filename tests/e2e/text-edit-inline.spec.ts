// text-edit-inline beyond its scenarios (spec/behavior/text-edit-inline.md): what the page shows while and after a
// text is edited in place (the edited element's marks come and go, a kept line break is drawn as <br>, Escape draws the
// text the document holds again), where the focus is (a click on the edited text keeps it there; after the edit the
// canvas keys work again), the keys of the edit that never reach the tree, the frame no longer aria-hidden while it
// holds the focus, the outline and label of the edit in the text editing mode colour, and the refusal that names why
// the edit cannot start. The document, the selection and the history
// are read through the read-only test port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ADD = 'selection.add#canvas-click-element-shift';
const DOUBLE_CLICK = 'text.startEdit#canvas-double-click-text-element';
const ENTER_EDIT = 'text.startEdit#key-enter-in-canvas';
const ENTER_KEEP = 'text.set#key-enter-in-text-editing';
const ESCAPE = 'text.cancelEdit#key-escape-in-text-editing';
const SHIFT_ENTER = 'text.insertLineBreak#key-shift-enter-in-text-editing';
const INTRO = 'Fresh coffee, roasted every week.';

interface Tree {
  readonly id: string;
  readonly text: string | null;
  readonly children: readonly Tree[];
}
// the Hero's children (id and text), the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const hero = p.document().pages[0]?.tree.children.find((c) => c.id === 'n-hero');
    return { hero: hero?.children.map((c) => [c.id, c.text]) ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
const hero = (intro: string) => [
  ['n-title', 'Welcome to Aurora'],
  ['n-intro', intro],
  ['n-actions', null],
];

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

// the screen point at the centre of a node's element (a leaf: a press there hits the node itself)
function centre(page: Page, id: string) {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
}
const status = (page: Page) => page.getByRole('status');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('a double-click edits the text on the page itself, and Enter keeps it and gives the page its marks back', runs('project.open#menu-file', SELECT, DOUBLE_CLICK, ENTER_KEEP), async ({ page }) => {
  const at = await centre(page, 'n-intro');
  await page.mouse.dblclick(at.x, at.y);
  await expect(status(page)).toHaveText('Editing text — Enter or click away to keep it, Escape to cancel.');
  // the page's own element is edited: marked, focused, in the edit's key context
  await expect(drawn(page, 'n-intro')).toHaveAttribute('contenteditable', 'plaintext-only');
  await expect(drawn(page, 'n-intro')).toHaveAttribute('data-key-context', 'text-editing');
  await expect(drawn(page, 'n-intro')).toBeFocused();
  await page.keyboard.type(' Twice a week.');
  await expect(drawn(page, 'n-intro')).toHaveText(`${INTRO} Twice a week.`);
  expect(await read(page)).toEqual({ hero: hero(INTRO), selection: ['n-intro'], undoSteps: 0 });
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ hero: hero(`${INTRO} Twice a week.`), selection: ['n-intro'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Saved the text of Intro.');
  // the marks are gone and the page shows the kept text, drawn from the document
  await expect(drawn(page, 'n-intro')).not.toHaveAttribute('contenteditable');
  await expect(drawn(page, 'n-intro')).not.toHaveAttribute('data-key-context');
  await expect(drawn(page, 'n-intro')).toHaveText(`${INTRO} Twice a week.`);
});

test('after an edit the focus is back on the canvas: Enter starts the next edit', runs('project.open#menu-file', SELECT, ENTER_EDIT, ENTER_KEEP, ESCAPE), async ({ page }) => {
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ hero: hero(`${INTRO}!`), selection: ['n-intro'], undoSteps: 1 });
  expect(await page.evaluate(() => document.activeElement === document.body), 'the focus rests on the canvas').toBe(true);
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Editing text — Enter or click away to keep it, Escape to cancel.');
  await page.keyboard.type('?');
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Kept the text of Intro unchanged.');
  expect(await page.evaluate(() => document.activeElement === document.body), 'the focus rests on the canvas').toBe(true);
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Editing text — Enter or click away to keep it, Escape to cancel.');
});

test('a click on the text being edited keeps the focus in it', runs('project.open#menu-file', SELECT, ENTER_EDIT, ENTER_KEEP), async ({ page }) => {
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.keyboard.type(' One.');
  await page.mouse.click(at.x, at.y);
  await expect(drawn(page, 'n-intro')).toBeFocused();
  await page.keyboard.type(' Two.');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ hero: hero(`${INTRO} One. Two.`), selection: ['n-intro'], undoSteps: 1 });
});

test('while editing, Delete, the arrows and the letter shortcuts act on the text, never on the tree', runs('project.open#menu-file', SELECT, ENTER_EDIT, ENTER_KEEP), async ({ page }) => {
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  // Backspace and Delete delete characters, ArrowLeft and ArrowUp move the caret, R and C (wrap on the canvas) type
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.type('rc');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Delete');
  expect(await read(page)).toEqual({ hero: hero(INTRO), selection: ['n-intro'], undoSteps: 0 });
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ hero: hero('Fresh coffee, roasted every weekr'), selection: ['n-intro'], undoSteps: 1 });
});

test('a kept line break is drawn as a <br>, and Escape draws the text the document holds again', runs('project.open#menu-file', SELECT, ENTER_EDIT, SHIFT_ENTER, ENTER_KEEP, ESCAPE), async ({ page }) => {
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ hero: hero(`${INTRO}\nSecond line`), selection: ['n-intro'], undoSteps: 1 });
  const lines = () => drawn(page, 'n-intro').evaluate((el) => [...el.childNodes].map((n) => (n.nodeName === 'BR' ? '<br>' : (n.nodeValue ?? ''))));
  expect(await lines()).toEqual([INTRO, '<br>', 'Second line']);
  // an edit cancelled: what was typed leaves the page
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Third');
  await page.keyboard.press('Escape');
  await expect(drawn(page, 'n-intro')).not.toHaveAttribute('contenteditable');
  expect(await lines()).toEqual([INTRO, '<br>', 'Second line']);
  expect(await read(page)).toEqual({ hero: hero(`${INTRO}\nSecond line`), selection: ['n-intro'], undoSteps: 1 });
});

test('the canvas frame is hidden from assistive technology except while it holds the edited text', runs('project.open#menu-file', SELECT, ENTER_EDIT, ESCAPE), async ({ page }) => {
  const frame = page.locator('.frame__page');
  await expect(frame).toHaveAttribute('aria-hidden', 'true');
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await expect(frame).not.toHaveAttribute('aria-hidden');
  await page.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('aria-hidden', 'true');
});

// a colour token of the editor (tokens.css, #rrggbb) as the browser computes a colour
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) throw new Error(`${n} is not #rrggbb: "${hex}"`);
    return `rgb(${parseInt(m[1] as string, 16)}, ${parseInt(m[2] as string, 16)}, ${parseInt(m[3] as string, 16)})`;
  }, name);

test('while a text is edited its outline and label wear the text editing mode, and the selection look comes back after', runs('project.open#menu-file', SELECT, ENTER_EDIT, ESCAPE), async ({ page }) => {
  const outline = () => page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineColor);
  const label = page.locator('[data-chrome="label"]');
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  const selectionColour = await token(page, '--color-canvas-selection');
  const editingColour = await token(page, '--color-mode-text');
  expect(editingColour).not.toBe(selectionColour);
  await expect.poll(outline).toBe(selectionColour);
  await expect(label.locator('.chrome__name')).toHaveText('Intro');
  await page.keyboard.press('Enter');
  await expect.poll(outline).toBe(editingColour);
  await expect(label).toHaveText('Editing text · Intro');
  expect(await label.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(editingColour);
  await page.keyboard.press('Escape');
  await expect.poll(outline).toBe(selectionColour);
  await expect(label.locator('.chrome__name')).toHaveText('Intro');
});

test('Enter with several elements selected says the edit needs one',runs('project.open#menu-file', SELECT, ADD, ENTER_EDIT), async ({ page }) => {
  const intro = await centre(page, 'n-intro');
  const title = await centre(page, 'n-title');
  await page.mouse.click(intro.x, intro.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(title.x, title.y);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('This needs a single selection.');
  await expect(drawn(page, 'n-intro')).not.toHaveAttribute('contenteditable');
  expect(await read(page)).toEqual({ hero: hero(INTRO), selection: ['n-intro', 'n-title'], undoSteps: 0 });
});
