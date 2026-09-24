// The commands foundation part 1 builds, run through their doors with the real mouse and keyboard. Each test asserts
// an end artifact: the geometry of the window's regions, a computed style, or the stored preferences after an
// immediate reload.
import { expect, test, type Page } from '@playwright/test';

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not laid out`);
  return found;
};

const storedPreferences = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('preferences') ?? 'null') as unknown);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('Ctrl+B and Ctrl+Alt+B give the sidebar and the inspector columns to the canvas, and take them back', async ({ page }) => {
  const start = await box(page, '.workbench');
  const sidebar = await box(page, '.sidebar');
  const inspector = await box(page, '.inspector');

  await page.keyboard.press('Control+b');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  expect((await box(page, '.workbench')).width).toBeCloseTo(start.width + sidebar.width, 0);
  expect((await box(page, '.workbench')).x).toBeCloseTo(sidebar.x, 0);

  await page.keyboard.press('Control+Alt+b');
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect((await box(page, '.workbench')).width).toBeCloseTo(start.width + sidebar.width + inspector.width, 0);

  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+Alt+b');
  expect(await box(page, '.workbench')).toEqual(start);
});

test('Ctrl+\\ collapses every dock and the second Ctrl+\\ puts back exactly what was open', async ({ page }) => {
  // hide the inspector first: the restore must not bring it back
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Toggle inspector/ }).click();
  const before = await box(page, '.workbench');

  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  const collapsed = await box(page, '.workbench');
  expect(collapsed.width).toBeGreaterThan(before.width);

  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect(await box(page, '.workbench')).toEqual(before);
});

test('View › Workbench opens the dock under the canvas and closes it again', async ({ page }) => {
  const canvas = await box(page, '.centre');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Workbench', exact: true }).click();
  const shorter = await box(page, '.centre');
  expect(shorter.height).toBeLessThan(canvas.height);
  const dock = await box(page, '.dock');
  expect(dock.y).toBeGreaterThanOrEqual(shorter.y + shorter.height - 1);

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Workbench', exact: true }).click();
  expect(await box(page, '.centre')).toEqual(canvas);
});

test('View › Theme › Dark repaints the editor with the dark tokens and keeps them after reload', async ({ page }) => {
  const background = () => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await background();

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).hover();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  const dark = await background();
  expect(dark).not.toBe(light);

  await page.reload();
  expect(await background()).toBe(dark);
  expect(await storedPreferences(page)).toEqual({ locale: 'en', theme: 'dark' });
});

test('the language menu of the status bar switches the editor to Portuguese and keeps it after reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Português (Brasil)', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(await storedPreferences(page)).toEqual({ locale: 'pt-BR', theme: 'system' });
  await expect(page.getByRole('button', { name: 'Exibir', exact: true })).toBeVisible();
});
