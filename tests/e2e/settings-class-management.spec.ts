import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runs } from './door.ts';

const INSERT = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const STYLE = 'workspace.setActiveTab#inspector-tab-style';
const CLASSES = 'element.setClasses#inspector-classes';
const CHIP = 'inspector.setStyleTarget#inspector-class-bar-target';
const BG = 'style.set#inspector-background-color';
const CUSTOM = 'element.setCustomAttribute#inspector-custom-attribute-add';
const ADD_CLASS = 'classes.apply#inspector-class-add';

type Project = { classes?: { name: string; styles: Record<string, Record<string, Record<string, string>>> }[]; pages: { tree: { children: { classes: string[] }[] } }[] };
const project = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: { document: () => Project } }).__builderTestPort.document());

async function startWithButton(page: Page): Promise<void> {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry: 'button' } }).click();
  await control(page, SETTINGS).click();
}

async function typeInto(page: Page, field: ReturnType<typeof control>, value: string): Promise<void> {
  await field.locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

test('a Settings class enters the project registry, becomes a Style target and keeps inspector width', runs(INSERT, TILE, SETTINGS, CLASSES, STYLE, CHIP, BG, ADD_CLASS), async ({ page }) => {
  await startWithButton(page);
  await typeInto(page, control(page, CLASSES), 'btn');
  expect((await project(page)).classes).toEqual([{ name: 'btn', styles: {} }]);
  expect((await project(page)).pages[0]?.tree.children[0]?.classes).toEqual(['btn']);

  await control(page, STYLE).click();
  const chip = control(page, CHIP, { args: { target: 'class', className: 'btn' } });
  await chip.click();
  await expect(chip).toHaveClass(/is-current/);
  await typeInto(page, control(page, BG), '#ff0000');
  expect((await project(page)).classes?.[0]?.styles.desktop?.base?.['background-color']).toBe('#ff0000');
  await expect(page.frameLocator('.frame__page').locator('button').first()).toHaveCSS('background-color', 'rgb(255, 0, 0)');

  const before = await page.locator('.inspector').boundingBox();
  await control(page, ADD_CLASS).click();
  const after = await page.locator('.inspector').boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThan(1);
});

test('a reserved custom attribute is refused locally and its draft stays with its original selection', runs(INSERT, TILE, SETTINGS, CUSTOM), async ({ page }) => {
  await startWithButton(page);
  const before = await project(page);
  const name = control(page, CUSTOM, { args: { value: '' } }).locator('input[data-local="custom-attribute-name"]');
  await name.click();
  await page.keyboard.type('style');
  await page.keyboard.press('Enter');
  expect(await project(page)).toEqual(before);
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(control(page, CUSTOM, { args: { value: '' } }).locator('.field-row__refusal')).toContainText('Style');

  await name.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('data-draft');
  await control(page, TILE, { args: { entry: 'section' } }).click();
  await expect(name).toHaveValue('');
  expect((await project(page)).pages[0]?.tree.children[0]?.classes).toEqual([]);
});
