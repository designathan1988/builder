import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { control, runs } from './door.ts';

const INSERT = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const TAG = 'element.setTag#inspector-tag';
const LINK = 'element.setLink#inspector-href';
const NEW_TAB = 'element.setLink#inspector-new-tab';
const EXPORT = 'project.export#toolbar-top-bar-export';
const TEXT = 'text.set#inspector-text';

type Node = { type: string; tag: string; text: string | null; attributes: Record<string, string | boolean>; children: Node[] };
const tree = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: { document: () => { pages: { tree: Node }[] } } }).__builderTestPort.document().pages[0]?.tree);

async function typeField(page: Page, locator: ReturnType<Page['getByRole']>, value: string): Promise<void> {
  await locator.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

test('the Select parts list edits each Option text and value and reload keeps both', runs(INSERT, TILE, SETTINGS, TEXT), async ({ page }) => {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry: 'select' } }).click();
  await control(page, SETTINGS).click();
  const text = page.getByRole('textbox', { name: 'Option 2 · Text' });
  await text.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('Second'); await page.keyboard.press('Tab');
  await typeField(page, page.getByRole('textbox', { name: 'Option 2 · Value' }), 'second');
  expect((await tree(page))?.children[0]?.children[1]).toMatchObject({ text: 'Second', attributes: { value: 'second' } });
  await expect(page.frameLocator('.frame__page').locator('select option').nth(1)).toHaveText('Second');
  await expect(page.frameLocator('.frame__page').locator('select option').nth(1)).toHaveAttribute('value', 'second');
  await page.reload(); await control(page, SETTINGS).click();
  await expect(page.getByRole('textbox', { name: 'Option 2 · Text' })).toHaveValue('Second');
  await expect(page.getByRole('textbox', { name: 'Option 2 · Value' })).toHaveValue('second');
});

test('Link to button warns, removes hidden link data, restores by Undo and exports a button', runs(INSERT, TILE, SETTINGS, LINK, NEW_TAB, TAG, EXPORT), async ({ page }) => {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry: 'link' } }).click();
  await control(page, SETTINGS).click();
  await typeField(page, page.getByRole('textbox', { name: 'Link address' }), 'https://example.com');
  await page.getByRole('checkbox', { name: 'Open in a new tab' }).check();
  const tag = page.getByRole('combobox', { name: 'HTML tag' });
  await tag.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('button');
  await expect(control(page, TAG).locator('.field-row__warning')).toContainText('Link address, Open in a new tab');
  await page.keyboard.press('Enter');
  expect((await tree(page))?.children[0]).toMatchObject({ tag: 'button', attributes: {} });
  await expect(page.getByRole('textbox', { name: 'Link address' })).toHaveCount(0);
  await control(page, 'history.undo#toolbar-top-bar').click();
  expect((await tree(page))?.children[0]).toMatchObject({ tag: 'a', attributes: { href: 'https://example.com', newTab: true } });
  await control(page, 'history.redo#toolbar-top-bar').click();
  const download = page.waitForEvent('download');
  await control(page, EXPORT).click();
  const files = unzip(fs.readFileSync(await (await download).path()));
  const html = files.get('index.html')?.toString('utf8') ?? '';
  expect(html).toContain('<button');
  expect(html).not.toContain('https://example.com');
});
