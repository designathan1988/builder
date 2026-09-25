// inspector-panel beyond its scenarios (spec/behavior/inspector-panel.md): the hints with nothing selected and Page
// properties as the feature table says, the selector bar's icon, name and tag, the eight sections in their order, the
// summaries of collapsed sections read from the page, the section header's keys, the collapsed sections kept for
// another element and after a reload, the Settings and Style tabs, the text field (its Enter and Escape doors, the text
// area's own Shift+Enter, Tab, a click elsewhere, drawn for one text element only), Element actions › Hide, and the
// dock's tab. The document, the selection and the history
// are read through the read-only test port; the page through the frame; the editor's regions by their geometry.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { isFeatureBuilt } from '../../src/app/features.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ADD = 'selection.add#canvas-click-element-shift';
const ROW = 'selection.select#layers-row';
const SECTION = 'inspector.toggleSection#inspector-section-header';
const STYLE = 'workspace.setActiveTab#inspector-tab-style';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const INTERACTIONS = 'workspace.setActiveTab#inspector-tab-interactions';
const DOCK_TAB = 'workspace.setActiveTab#tab-strip-tab';
const TEXT = 'text.set#inspector-text';
const ENTER = 'text.set#key-enter-in-element-text-field';
const ESCAPE = 'text.cancelEdit#key-escape-in-element-text-field';
const HIDE = 'element.toggleHidden#menu-element-actions';
const PAGE_PROPERTIES = 'page.openProperties#inspector-page-properties-button';
const INTRO = 'Fresh coffee, roasted every week.';

const EN = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
const LAYOUT = JSON.parse(fs.readFileSync('manifest/layout.json', 'utf8')) as { panels: Record<string, { labelKey: string }> };
const ELEMENTS = JSON.parse(fs.readFileSync('manifest/elements.json', 'utf8')) as { elements: { id: string; icon: string }[] };
const PROPERTIES = JSON.parse(fs.readFileSync('manifest/properties.json', 'utf8')) as {
  sections: { id: string }[];
  properties: { id: string; section: string }[];
  composites: { id: string; section: string }[];
  recipes: { id: string; section: string }[];
};
const iconOf = (type: string) => ELEMENTS.elements.find((e) => e.id === type)?.icon ?? '';
const words = (key: string, params: Record<string, string> = {}) => (EN[key] ?? '').replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '');

// the Style sections: those of properties.json with a field in the Style tab (an inspector field of one of their
// properties, composites or recipes placed in inspector-style), in the order of properties.json
const STYLE_FIELDS = new Set<string>();
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(`manifest/commands/${file}`, 'utf8')) as {
    commands: { entryPoints: { kind: string; property?: string | null; composite?: string | null; recipe?: string | null; placement: { region: string } | string }[] }[];
  };
  for (const c of commands)
    for (const d of c.entryPoints) {
      const id = d.property ?? d.composite ?? d.recipe ?? null;
      if (d.kind === 'inspector-field' && id !== null && typeof d.placement === 'object' && d.placement.region === 'inspector-style') STYLE_FIELDS.add(id);
    }
}
const sectionOf = new Map([...PROPERTIES.properties, ...PROPERTIES.composites, ...PROPERTIES.recipes].map((p) => [p.id, p.section]));
const STYLE_SECTIONS = PROPERTIES.sections.map((s) => s.id).filter((s) => [...STYLE_FIELDS].some((id) => sectionOf.get(id) === s));

interface Tree {
  readonly id: string;
  readonly text: string | null;
  readonly hidden?: true;
  readonly children: readonly Tree[];
}
const port = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), selection: p.selection(), undoSteps: p.history().undoSteps };
  });
function nodeIn(tree: Tree, id: string): Tree | null {
  if (tree.id === id) return tree;
  for (const c of tree.children) {
    const found = nodeIn(c, id);
    if (found) return found;
  }
  return null;
}
const nodeOf = async (page: Page, id: string) => {
  const tree = (await port(page)).document.pages[0]?.tree;
  return tree ? nodeIn(tree, id) : null;
};
const textOf = async (page: Page, id: string) => (await nodeOf(page, id))?.text ?? null;
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-door="${OPEN}"]`).click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

// a screen point of a node's element on the canvas: its centre (a leaf), or a point inside its top-left corner (the
// padding of a section, which its children do not cover)
function pointOf(page: Page, id: string, at: 'centre' | 'corner' = 'centre') {
  return page.evaluate(
    ([node, where]) => {
      const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
      const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
      if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
      const zoom = iframe.currentCSSZoom;
      const frame = iframe.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const [x, y] = where === 'centre' ? [r.left + r.width / 2, r.top + r.height / 2] : [r.left + 12, r.top + 12];
      return { x: frame.left + x * zoom, y: frame.top + y * zoom };
    },
    [id, at] as const,
  );
}
async function select(page: Page, id: string, at: 'centre' | 'corner' = 'centre') {
  const p = await pointOf(page, id, at);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await port(page)).selection).toEqual([id]);
}

const header = (page: Page, section: string) => control(page, SECTION, { args: { section } });
const topOf = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())?.y ?? Number.NaN;
// how far below the Space header the Size header sits: one header row while Space is collapsed, its fields below it
// while it is open
const spaceRoom = async (page: Page) => {
  const space = await header(page, 'space').boundingBox();
  const size = await header(page, 'size').boundingBox();
  return space && size ? size.y - space.y : Number.NaN;
};
const textField = (page: Page) => control(page, TEXT).locator('textarea');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('with nothing selected the Style tab gives the hints first; Page properties waits as the feature table says', runs(OPEN, SELECT), async ({ page }) => {
  await openAurora(page);
  const hints = page.locator('[data-region="inspector-style"] .inspector-hints li');
  const panel = words(LAYOUT.panels.elements?.labelKey ?? '');
  await expect(hints).toHaveText([words('inspector.hint.insert', { panel }), words('inspector.hint.select'), words('inspector.hint.editText')]);
  await expect(page.locator('.selector-bar__element')).toHaveText(EN['inspector.nothingSelected'] ?? '');
  const pageProperties = page.locator(`[data-door="${PAGE_PROPERTIES}"]`);
  if (isFeatureBuilt('page-properties')) await expect(pageProperties).not.toHaveAttribute('aria-disabled', 'true');
  else {
    await expect(pageProperties).toHaveAttribute('aria-disabled', 'true');
    await expect(pageProperties).toHaveAttribute('title', new RegExp(EN['common.notAvailableYet'] ?? 'not available yet'));
  }
  await select(page, 'n-intro');
  await expect(hints).toHaveCount(0);
});

test("the selector bar shows the icon of the element's type, its name and its exported tag", runs(OPEN, SELECT, ROW), async ({ page }) => {
  await openAurora(page);
  const bar = page.locator('.selector-bar__element');
  await select(page, 'n-intro');
  await expect(bar.locator('use')).toHaveAttribute('href', `#${iconOf('paragraph')}`);
  await expect(bar.locator('.selector-bar__name')).toHaveText('Intro');
  await expect(bar.locator('.selector-bar__tag')).toHaveText('p');
  await select(page, 'n-hero', 'corner');
  await expect(bar.locator('use')).toHaveAttribute('href', `#${iconOf('section')}`);
  await expect(bar.locator('.selector-bar__tag')).toHaveText('section');
  await runDoor(page, ROW, { args: { target: 'n-page' } });
  await expect(bar.locator('use')).toHaveAttribute('href', `#${iconOf('page')}`);
  await expect(bar.locator('.selector-bar__name')).toHaveText('Page');
  await expect(bar.locator('.selector-bar__tag')).toHaveText('body');
});

test('the Style tab draws the eight sections in the order of properties.json, for every element', runs(OPEN, SELECT), async ({ page }) => {
  expect(STYLE_SECTIONS).toHaveLength(8);
  await openAurora(page);
  const order = () => page.locator(`[data-door="${SECTION}"]`).evaluateAll((els) => els.map((el) => (JSON.parse(el.getAttribute('data-args') ?? '{}') as { section?: string }).section));
  await select(page, 'n-intro');
  expect(await order()).toEqual(STYLE_SECTIONS);
  await select(page, 'n-hero', 'corner');
  expect(await order()).toEqual(STYLE_SECTIONS);
});

test('a collapsed section summarises the values the page computes; an open one shows its fields instead', runs(OPEN, SELECT, SECTION), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-hero', 'corner');
  for (const s of STYLE_SECTIONS) await runDoor(page, SECTION, { args: { section: s } });
  const summary = (s: string) => header(page, s).locator('.inspector-section__summary');
  const none = EN['inspector.summary.none'] ?? '';
  // the fixture gives the Hero a padding of 56px 40px; everything else is the browser's default for a section
  await expect(summary('space')).toHaveText('P 56px 40px');
  await expect(summary('position')).toHaveText('static · z auto');
  await expect(summary('size')).toHaveText('auto × auto');
  await expect(summary('layout')).toHaveText('block');
  await expect(summary('paint')).toHaveText(none);
  await expect(summary('border')).toHaveText(none);
  await expect(summary('text')).toHaveText('16px · 400');
  await expect(summary('effects')).toHaveText(none);
  // a paragraph's margins come from the browser
  await select(page, 'n-intro');
  await expect(summary('space')).toHaveText('M 16px 0px');
  await runDoor(page, SECTION, { args: { section: 'space' } });
  await expect(summary('space')).toHaveCount(0);
});

test('Enter or Space on a focused section header collapses and expands it, and the focus stays on it', runs(OPEN, SELECT, SECTION), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  const open = await spaceRoom(page);
  expect(open).toBeGreaterThan(100);
  await runDoor(page, SECTION, { args: { section: 'space' } });
  await expect.poll(() => spaceRoom(page)).toBeLessThan(48);
  await expect(header(page, 'space')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => spaceRoom(page)).toBeGreaterThan(100);
  await expect(header(page, 'space')).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => spaceRoom(page)).toBeLessThan(48);
  await expect(header(page, 'space')).toHaveAttribute('aria-expanded', 'false');
});

test('a collapsed section stays collapsed for another element and after an immediate reload', runs(OPEN, SELECT, SECTION), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SECTION, { args: { section: 'space' } });
  await expect.poll(() => spaceRoom(page)).toBeLessThan(48);
  await select(page, 'n-hero', 'corner');
  await expect.poll(() => spaceRoom(page)).toBeLessThan(48);
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  // the work and its selection come back (autosave-restore), and so does the collapsed section
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-hero']);
  await expect.poll(() => spaceRoom(page)).toBeLessThan(48);
});

test('the Settings tab shows its region under the header, and the Style tab brings back the selector bar', runs(OPEN, SELECT, SETTINGS, STYLE), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  const interactions = page.locator(`[data-door="${INTERACTIONS}"]`);
  // the Interactions tab waits for its feature
  if (!isFeatureBuilt('events-actions')) await expect(interactions).toHaveAttribute('aria-disabled', 'true');
  await runDoor(page, SETTINGS);
  await expect(page.locator(`[data-door="${SETTINGS}"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-region="inspector-settings"]')).toBeVisible();
  await expect(page.locator('[data-region="inspector-selector-bar"]')).toHaveCount(0);
  await expect(page.locator('[data-region="inspector-style"]')).toHaveCount(0);
  expect(await topOf(page, '[data-region="inspector-settings"]')).toBeLessThan((await topOf(page, '[data-region="inspector-header"]')) + 48);
  await runDoor(page, STYLE);
  await expect(page.locator(`[data-door="${STYLE}"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-region="inspector-settings"]')).toHaveCount(0);
  expect(await topOf(page, '[data-region="inspector-style"]')).toBeGreaterThan(await topOf(page, '[data-region="inspector-selector-bar"]'));
});

test('the text field keeps the typed text with Enter, as one undo step, and the canvas draws it', runs(OPEN, SELECT, SETTINGS, TEXT, ENTER), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SETTINGS);
  await expect(textField(page)).toHaveValue(INTRO);
  await textField(page).click();
  await page.keyboard.press('Control+A');
  // the letters of canvas keys (P, R, C, M) type into the field, never onto the tree
  await page.keyboard.type('Pour-over coffee, prepared every morning.');
  expect(await textOf(page, 'n-intro')).toBe(INTRO);
  await page.keyboard.press('Enter');
  await expect.poll(() => textOf(page, 'n-intro')).toBe('Pour-over coffee, prepared every morning.');
  await expect(drawn(page, 'n-intro')).toHaveText('Pour-over coffee, prepared every morning.');
  await expect(textField(page)).toHaveValue('Pour-over coffee, prepared every morning.');
  const after = await port(page);
  expect(after.undoSteps).toBe(1);
  expect(after.selection).toEqual(['n-intro']);
  expect(nodeIn(after.document.pages[0]?.tree ?? { id: '', text: null, children: [] }, 'n-hero')?.children.map((c) => c.id)).toEqual(['n-title', 'n-intro', 'n-actions']);
  await expect(page.getByRole('status')).toHaveText(words('status.textEdit.committed', { name: 'Intro' }));
});

test('Escape puts the text field back to the text the document holds, and leaving it then keeps nothing', runs(OPEN, SELECT, SETTINGS, TEXT, ESCAPE), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SETTINGS);
  await textField(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Something else entirely');
  await page.keyboard.press('Escape');
  await expect(textField(page)).toHaveValue(INTRO);
  await expect(textField(page)).toBeFocused();
  await expect(page.getByRole('status')).toHaveText(words('status.textEdit.cancelled', { name: 'Intro' }));
  // leaving the field now keeps nothing: Escape left no typing behind
  await page.keyboard.press('Tab');
  await expect(textField(page)).not.toBeFocused();
  expect(await textOf(page, 'n-intro')).toBe(INTRO);
  expect((await port(page)).undoSteps).toBe(0);
});

test('Shift+Enter types a line break in the text field, and Enter keeps it as "\\n", drawn as a line break', runs(OPEN, SELECT, SETTINGS, TEXT, ENTER), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SETTINGS);
  await textField(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('One');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Two');
  // the line break is the field's own: nothing is kept yet
  await expect(textField(page)).toHaveValue('One\nTwo');
  expect(await textOf(page, 'n-intro')).toBe(INTRO);
  await page.keyboard.press('Enter');
  await expect.poll(() => textOf(page, 'n-intro')).toBe('One\nTwo');
  await expect(drawn(page, 'n-intro').locator('br')).toHaveCount(1);
  await expect(textField(page)).toHaveValue('One\nTwo');
  expect((await port(page)).undoSteps).toBe(1);
});

test('leaving the text field with Tab keeps the typed text', runs(OPEN, SELECT, SETTINGS, TEXT), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SETTINGS);
  await textField(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hello');
  expect(await textOf(page, 'n-intro')).toBe(INTRO);
  await page.keyboard.press('Tab');
  await expect.poll(() => textOf(page, 'n-intro')).toBe('Hello');
  await expect(textField(page)).not.toBeFocused();
  expect((await port(page)).undoSteps).toBe(1);
});

test('a click on another element keeps the typed text for the element it was typed for', runs(OPEN, SELECT, SETTINGS, TEXT), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, SETTINGS);
  await textField(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hi there');
  await select(page, 'n-title');
  await expect.poll(() => textOf(page, 'n-intro')).toBe('Hi there');
  expect(await textOf(page, 'n-title')).toBe('Welcome to Aurora');
  await expect(textField(page)).toHaveValue('Welcome to Aurora');
});

test('the text field is drawn for one selected text element only', runs(OPEN, SELECT, ADD, SETTINGS), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-hero', 'corner');
  await runDoor(page, SETTINGS);
  await expect(page.locator('[data-region="inspector-settings"]')).toBeVisible();
  await expect(control(page, TEXT)).toHaveCount(0);
  await select(page, 'n-intro');
  await expect(textField(page)).toHaveValue(INTRO);
  const title = await pointOf(page, 'n-title');
  await page.keyboard.down('Shift');
  await page.mouse.click(title.x, title.y);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-intro', 'n-title']);
  await expect(control(page, TEXT)).toHaveCount(0);
  await expect(page.locator('[data-region="inspector-settings"]')).toHaveText(words('canvas.selectedCount', { count: '2' }));
});

test('Element actions › Hide hides the selected element on the canvas, as one undo step', runs(OPEN, SELECT, HIDE), async ({ page }) => {
  await openAurora(page);
  await select(page, 'n-intro');
  await runDoor(page, HIDE);
  await expect.poll(async () => (await nodeOf(page, 'n-intro'))?.hidden ?? false).toBe(true);
  await expect.poll(() => drawn(page, 'n-intro').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  expect((await port(page)).undoSteps).toBe(1);
  await expect(page.getByRole('status')).toHaveText(words('status.hidden', { name: 'Intro' }));
});

test("a dock tab shows its panel, opening the collapsed dock", runs(DOCK_TAB), async ({ page }) => {
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await runDoor(page, DOCK_TAB, { args: { panel: 'timeline' } });
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-label', words(LAYOUT.panels.timeline?.labelKey ?? ''));
  await expect(control(page, DOCK_TAB, { args: { panel: 'timeline' } })).toHaveAttribute('aria-selected', 'true');
});
