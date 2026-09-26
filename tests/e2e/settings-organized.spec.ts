import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runs } from './door.ts';

const INSERT = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const BUTTON_TYPE = 'element.setAttribute#inspector-button-type';

const documentOf = (page: Page) => page.evaluate(() => {
  const port = (window as unknown as { __builderTestPort: { document: () => { pages: { tree: { children: { type: string; attributes: Record<string, unknown> }[] } }[] } } }).__builderTestPort;
  return port.document();
});

test('Settings groups a link and shows the unstored button default before a real attribute edit', runs(INSERT, TILE, SETTINGS, BUTTON_TYPE), async ({ page }) => {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry: 'link' } }).click();
  await control(page, SETTINGS).click();
  expect(await page.locator('[data-settings-section] h3').allTextContents()).toEqual(['General', 'Link', 'Attributes']);
  expect(await page.locator('[data-settings-section] p').allTextContents()).toEqual([
    'Identity, content and element type',
    'Destination and browser behaviour',
    'HTML attributes and custom data',
  ]);

  await control(page, TILE, { args: { entry: 'button' } }).click();
  expect(await page.locator('[data-settings-section] h3').allTextContents()).toEqual(['General', 'Attributes']);
  const input = control(page, BUTTON_TYPE).locator('input');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', 'submit');
  expect((await documentOf(page)).pages[0]?.tree.children[1]?.attributes.buttonType).toBeUndefined();

  await input.click();
  await page.keyboard.type('reset');
  await page.keyboard.press('Enter');
  expect((await documentOf(page)).pages[0]?.tree.children[1]?.attributes.buttonType).toBe('reset');
});
