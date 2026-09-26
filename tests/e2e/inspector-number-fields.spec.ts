// inspector-number-fields beyond its scenarios (spec/behavior/inspector-number-fields.md): the multipliers of the
// arrows and of the step buttons in one run, PageUp/PageDown, the scrub following the pointer live and being one undo
// step, Escape during a scrub, Escape in the field then leaving it, leaving the field with Tab, the keys a field keeps
// (Delete, Backspace, letters, Ctrl+Z never reach the canvas nor the history), the unit menu's list, and a length field
// of a feature not registered yet. The document, the selection and the history are read through the read-only test
// port; the element's width through the frame's computed style.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { isFeatureBuilt } from '../../src/app/features.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const WIDTH = 'style.set#inspector-width';
const MIN_WIDTH = 'style.set#inspector-min-width';
const ENTER = 'style.set#key-enter-in-number-field';
const ESCAPE = 'field.cancel#key-escape-in-number-field';
const UP = 'field.step#key-arrow-up-in-number-field';
const DOWN = 'field.step#key-arrow-down-in-number-field';
const PAGE_UP = 'field.step#key-page-up-in-number-field';
const PAGE_DOWN = 'field.step#key-page-down-in-number-field';
const STEP_UP = 'field.step#inspector-step-up';
const STEP_DOWN = 'field.step#inspector-step-down';
const SCRUB = 'field.scrub#panel-drag-field-label-horizontal';
const UNIT = 'field.setUnit#inspector-unit-menu';
const DRAG_ESCAPE = 'drag.cancel#key-escape-in-drag';
const UNDO = 'history.undo#toolbar-top-bar';
const ACTIONS = 'n-actions';
// presses in a row on the same field, each within this of the one before, are one undo step (interactions.json; spec
// inspector-number-fields, Problems in Pager 4)
const BURST = (JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: number }[] }).constants.find((c) => c.id === 'numberField.stepBurstWindow')?.value ?? Number.NaN;
// the time the history reads (Date.now) stands still, so presses come within the window of each other; `pause` moves it
// past the window, as a person who waits a second
async function burstClock(page: Page): Promise<() => Promise<void>> {
  let now = Date.parse('2026-09-26T12:00:00Z');
  await page.clock.setFixedTime(now);
  return async () => {
    now += BURST + 1;
    await page.clock.setFixedTime(now);
  };
}

interface Tree {
  readonly id: string;
  readonly styles: { readonly desktop?: { readonly base?: Readonly<Record<string, string>> } };
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
// the width the document holds for Actions at the base breakpoint and state (undefined: none), and the steps to undo
const stored = async (page: Page) => {
  const { document, undoSteps } = await port(page);
  const tree = document.pages[0]?.tree;
  const node = tree ? nodeIn(tree, ACTIONS) : null;
  return { width: node?.styles.desktop?.base?.width, undoSteps, present: node !== null };
};
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);
const computedWidth = (page: Page) => drawn(page, ACTIONS).evaluate((el) => getComputedStyle(el).width);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-door="${OPEN}"]`).click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, ACTIONS)).toHaveCount(1);
}
async function selectActions(page: Page) {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, ACTIONS);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await port(page)).selection).toEqual([ACTIONS]);
}
const input = (page: Page, ref = WIDTH) => control(page, ref).locator('input');
// types into the Width field what it holds replaced by `text`, and keeps it with Enter: one undo step
async function typeWidth(page: Page, text: string) {
  await input(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
// a screen point of a control's middle, in whole pixels
async function middleOf(page: Page, ref: string, args: Readonly<Record<string, unknown>>) {
  const target = control(page, ref, { args });
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error(`${ref} is not laid out`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
  // at 100 % (Ctrl+0, the zoom door), where the page's lengths resolve to whole px: at the Fit zoom Chrome resolves a
  // width of 240px as 239.982px under the frame's CSS zoom (the user's decision of 2026-09-25 for the style scenarios)
  await page.keyboard.press('Control+0');
  await expect(page.locator('.frame__page')).toHaveCSS('zoom', '1');
  await selectActions(page);
});

test('the arrows step by 1, with Shift by 10, with Alt by 0.1, PageUp and PageDown by 10; presses in a row are one undo step, one after a pause starts another', runs(OPEN, SELECT, WIDTH, ENTER, UP, DOWN, PAGE_UP, PAGE_DOWN, UNDO), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  const pause = await burstClock(page);
  const expectWidth = async (width: string, undoSteps: number) => {
    await expect.poll(() => stored(page)).toEqual({ width, undoSteps, present: true });
    await expect.poll(() => computedWidth(page)).toBe(width);
  };
  // one burst: every press is one more step of the value, and the burst one undo step
  await page.keyboard.press('ArrowUp');
  await expectWidth('241px', 2);
  await page.keyboard.press('Shift+ArrowUp');
  await expectWidth('251px', 2);
  await page.keyboard.press('ArrowDown');
  await expectWidth('250px', 2);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => stored(page)).toEqual({ width: '249.9px', undoSteps: 2, present: true });
  // after a pause longer than the window, another burst: another undo step
  await pause();
  await page.keyboard.press('PageUp');
  await expect.poll(() => stored(page)).toEqual({ width: '259.9px', undoSteps: 3, present: true });
  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageDown');
  await expect.poll(() => stored(page)).toEqual({ width: '239.9px', undoSteps: 3, present: true });
  // one Undo takes back one burst, the next one the burst before it
  await runDoor(page, UNDO);
  await expect.poll(() => stored(page)).toEqual({ width: '249.9px', undoSteps: 2, present: true });
  await runDoor(page, UNDO);
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
});

test('the step buttons step by 1, with Shift by 10 and with Alt by 0.1; clicks in a row are one undo step, one after a pause starts another', runs(OPEN, SELECT, WIDTH, ENTER, STEP_UP, STEP_DOWN), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  const pause = await burstClock(page);
  const button = (ref: string) => control(page, ref, { args: { property: 'width' } });
  await button(STEP_UP).click();
  await expect.poll(() => stored(page)).toEqual({ width: '241px', undoSteps: 2, present: true });
  await button(STEP_UP).click({ modifiers: ['Shift'] });
  await expect.poll(() => stored(page)).toEqual({ width: '251px', undoSteps: 2, present: true });
  await button(STEP_DOWN).click({ modifiers: ['Alt'] });
  await expect.poll(() => stored(page)).toEqual({ width: '250.9px', undoSteps: 2, present: true });
  await pause();
  await button(STEP_DOWN).click();
  await expect.poll(() => stored(page)).toEqual({ width: '249.9px', undoSteps: 3, present: true });
  // the page draws 249.9px to Chrome's layout unit (1/64 px): 249.890625px
  await expect.poll(async () => Math.abs(parseFloat(await computedWidth(page)) - 249.9)).toBeLessThanOrEqual(1 / 64);
});

test('the scrub follows the pointer live and the whole drag is one undo step; Shift and Alt read on every move', runs(OPEN, SELECT, WIDTH, ENTER, SCRUB, UNDO), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  const from = await middleOf(page, SCRUB, { property: 'width', value: '240px' });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 4 });
  // live: 20 px is 10 steps, the canvas follows before the release
  await expect.poll(async () => (await stored(page)).width).toBe('250px');
  await expect.poll(() => computedWidth(page)).toBe('250px');
  await page.mouse.move(from.x + 50, from.y, { steps: 6 });
  await expect.poll(async () => (await stored(page)).width).toBe('265px');
  // Shift held now: the same travel counts ten times
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + 52, from.y, { steps: 2 });
  await expect.poll(async () => (await stored(page)).width).toBe('500px');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x + 50, from.y, { steps: 2 });
  await expect.poll(async () => (await stored(page)).width).toBe('242.5px');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  // the whole scrub is one step: one Undo goes back to 240px
  await expect.poll(() => stored(page)).toEqual({ width: '242.5px', undoSteps: 2, present: true });
  await runDoor(page, UNDO);
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
});

test('Escape during a scrub puts the width back, and the release after it writes nothing', runs(OPEN, SELECT, WIDTH, ENTER, SCRUB, DRAG_ESCAPE), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  const from = await middleOf(page, SCRUB, { property: 'width', value: '240px' });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 5 });
  await expect.poll(async () => (await stored(page)).width).toBe('260px');
  await page.keyboard.press('Escape');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await page.mouse.move(from.x + 80, from.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await expect.poll(() => computedWidth(page)).toBe('240px');
});

test('Escape puts back what was typed, so leaving the field then keeps nothing; leaving it with Tab keeps the typing', runs(OPEN, SELECT, WIDTH, ENTER, ESCAPE), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await input(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('30');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await input(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('320');
  await page.keyboard.press('Tab');
  await expect.poll(() => stored(page)).toEqual({ width: '320px', undoSteps: 2, present: true });
  await expect.poll(() => computedWidth(page)).toBe('320px');
});

test('Delete, Backspace, letters and Ctrl+Z typed in a field stay in the field: the selection, the element and the history stay', runs(OPEN, SELECT, WIDTH, ENTER), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await input(page).click();
  for (const key of ['End', 'Backspace', 'Home', 'Delete', 'x', 'Control+Z', 'Control+Z']) await page.keyboard.press(key);
  const after = await port(page);
  expect(after.selection).toEqual([ACTIONS]);
  expect(await stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await expect(drawn(page, ACTIONS)).toHaveCount(1);
});

test('the unit menu offers the units and keywords of Width; a point converts the width keeping its size, % is refused with a word', runs(OPEN, SELECT, WIDTH, ENTER, UNIT), async ({ page }) => {
  await typeWidth(page, '240');
  await expect.poll(() => stored(page)).toEqual({ width: '240px', undoSteps: 1, present: true });
  await control(page, UNIT, { args: { property: 'width', value: '240px' } }).first().click();
  const offered = await page.locator(`[data-door="${UNIT}"][role="menuitemradio"]`).evaluateAll((els) => els.map((el) => (JSON.parse(el.getAttribute('data-args') ?? '{}') as { unit?: string }).unit));
  for (const unit of ['px', '%', 'em', 'rem', 'vw', 'vh', 'pt', 'auto', 'min-content', 'max-content', 'fit-content']) expect(offered, unit).toContain(unit);
  await control(page, UNIT, { args: { property: 'width', value: '240px', unit: 'pt' } }).click();
  await expect.poll(() => stored(page)).toEqual({ width: '180pt', undoSteps: 2, present: true });
  await expect.poll(() => computedWidth(page)).toBe('240px');
  await control(page, UNIT, { args: { property: 'width', value: '180pt' } }).first().click();
  await control(page, UNIT, { args: { property: 'width', value: '180pt', unit: '%' } }).click();
  await expect(page.getByRole('status')).toHaveText('The value could not be converted to %.');
  expect(await stored(page)).toEqual({ width: '180pt', undoSteps: 2, present: true });
});

test('a length field of a feature not registered yet stays not available, its steps and scrub with it', runs(OPEN, SELECT), async ({ page }) => {
  const row = control(page, MIN_WIDTH);
  // once props-size-overflow is registered, Min width is its field, which its own tests run
  if (isFeatureBuilt('props-size-overflow')) {
    await expect(row.locator('input')).toBeEnabled();
    return;
  }
  await expect(row.locator('input')).toBeDisabled();
  await expect(row.locator(`[data-door="${STEP_UP}"]`)).toHaveAttribute('aria-disabled', 'true');
  await expect(row.locator(`[data-door="${SCRUB}"]`)).toHaveAttribute('aria-disabled', 'true');
  // a drag on its label writes nothing
  const label = await row.locator(`[data-door="${SCRUB}"]`).boundingBox();
  if (label === null) throw new Error('the Min width label is not laid out');
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
  await page.mouse.down();
  await page.mouse.move(label.x + label.width / 2 + 60, label.y + label.height / 2, { steps: 5 });
  await page.mouse.up();
  const { document } = await port(page);
  expect(nodeIn(document.pages[0]?.tree as Tree, ACTIONS)?.styles).toEqual({});
});
