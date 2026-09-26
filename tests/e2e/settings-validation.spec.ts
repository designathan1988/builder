import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runs } from './door.ts';

const INSERT = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const TYPE = 'element.setInputType#inspector-input-type';
const MAX = 'element.setAttribute#inspector-max';
const MIN = 'element.setAttribute#inspector-min';
const VALUE = 'element.setAttribute#inspector-value';
const STEP = 'element.setAttribute#inspector-step';
const PLACEHOLDER = 'element.setAttribute#inspector-placeholder';
const UNDO = 'history.undo#toolbar-top-bar';
const PAGE = 'page.openProperties#inspector-page-properties-button';

interface Node { readonly type: string; readonly attributes: Readonly<Record<string, unknown>>; readonly children: readonly Node[] }
const current = (page: Page) => page.evaluate(() => {
  const port = (window as unknown as { __builderTestPort: { document: () => { pages: { tree: Node }[] }; history: () => { undoSteps: number } } }).__builderTestPort;
  return { tree: port.document().pages[0]?.tree, history: port.history() };
});

async function openInput(page: Page, entry: string): Promise<void> {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry } }).click();
  await control(page, SETTINGS).click();
}

async function typeInto(page: Page, ref: string, value: string): Promise<void> {
  const input = control(page, ref).locator('input');
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

async function insertNext(page: Page, entry: string): Promise<void> {
  await control(page, PAGE).click();
  await control(page, TILE, { args: { entry } }).click();
}

async function rejects(page: Page, ref: string, value: string): Promise<void> {
  const before = await current(page);
  await typeInto(page, ref, value);
  expect(await current(page)).toEqual(before);
  await expect(control(page, ref).locator('.field-row__refusal')).toContainText(value);
}

test('number input refuses an unknown type and invalid numeric fields beside their doors', runs(INSERT, TILE, SETTINGS, TYPE, MAX, MIN, VALUE, STEP), async ({ page }) => {
  await openInput(page, 'input-number');
  await typeInto(page, TYPE, 'potato');
  expect((await current(page)).tree?.children[0]?.attributes).toEqual({ inputType: 'number' });
  await expect(control(page, TYPE).locator('.field-row__refusal')).toContainText('potato');

  await typeInto(page, MAX, '5');
  expect((await current(page)).tree?.children[0]?.attributes.max).toBe('5');
  await typeInto(page, MIN, '10');
  expect((await current(page)).tree?.children[0]?.attributes).toEqual({ inputType: 'number', max: '5' });
  await expect(control(page, MIN).locator('.field-row__refusal')).toContainText('10');

  await typeInto(page, VALUE, 'hello');
  expect((await current(page)).tree?.children[0]?.attributes.value).toBeUndefined();
  await expect(control(page, VALUE).locator('.field-row__refusal')).toContainText('hello');
  await typeInto(page, STEP, '-1');
  expect((await current(page)).tree?.children[0]?.attributes.step).toBeUndefined();
  await expect(control(page, STEP).locator('.field-row__refusal')).toContainText('-1');
  expect((await current(page)).history.undoSteps).toBe(2);
});

test('changing input type warns before discarding attributes and remains one undo step', runs(INSERT, TILE, SETTINGS, PLACEHOLDER, TYPE, UNDO), async ({ page }) => {
  await openInput(page, 'input-text');
  await typeInto(page, PLACEHOLDER, 'Your name');
  const input = control(page, TYPE).locator('input');
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('checkbox');
  await expect(control(page, TYPE).locator('.field-row__warning')).toContainText('Placeholder');
  expect((await current(page)).tree?.children[0]?.attributes.placeholder).toBe('Your name');
  await page.keyboard.press('Enter');
  expect((await current(page)).tree?.children[0]?.attributes).toEqual({ inputType: 'checkbox' });
  expect((await current(page)).history.undoSteps).toBe(3);
  await control(page, UNDO).click();
  expect((await current(page)).tree?.children[0]?.attributes).toEqual({ inputType: 'text', placeholder: 'Your name' });
});

test('date, colour and range values follow their input types', runs(INSERT, TILE, SETTINGS, PAGE, MAX, VALUE), async ({ page }) => {
  await openInput(page, 'input-date');
  await rejects(page, MAX, 'banana');
  await rejects(page, VALUE, '31/12/2020');
  await insertNext(page, 'input-color');
  await rejects(page, VALUE, 'red');
  await rejects(page, VALUE, '#12345');
  await insertNext(page, 'input-range');
  await rejects(page, VALUE, '500');
});

test('pattern, autocomplete, name and page language reject malformed text without changing the document', runs(INSERT, TILE, SETTINGS, PAGE, 'element.setAttribute#inspector-pattern', 'element.setAttribute#inspector-autocomplete', 'element.setAttribute#inspector-name', 'page.setSetting#inspector-page-language'), async ({ page }) => {
  await openInput(page, 'input-text');
  await rejects(page, 'element.setAttribute#inspector-pattern', '[');
  await rejects(page, 'element.setAttribute#inspector-autocomplete', 'banana');
  await rejects(page, 'element.setAttribute#inspector-name', 'user name');
  await control(page, PAGE).click();
  await rejects(page, 'page.setSetting#inspector-page-language', 'banana');
});

test('progress, meter, textarea and canvas keep impossible numbers out of the document', runs(INSERT, TILE, SETTINGS, PAGE, MAX, MIN, VALUE, 'element.setAttribute#inspector-rows', 'element.setAttribute#inspector-canvas-width', 'element.setAttribute#inspector-canvas-height'), async ({ page }) => {
  await openInput(page, 'progress');
  await rejects(page, MAX, '0');
  await rejects(page, VALUE, '150');
  await insertNext(page, 'meter');
  await typeInto(page, MIN, '10');
  await rejects(page, MAX, '1');
  await rejects(page, VALUE, 'abc');
  await insertNext(page, 'textarea');
  await rejects(page, 'element.setAttribute#inspector-rows', '0');
  await insertNext(page, 'canvas');
  await rejects(page, 'element.setAttribute#inspector-canvas-width', '-5');
  await rejects(page, 'element.setAttribute#inspector-canvas-height', '99999999');
});
