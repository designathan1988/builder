// The commands foundation part 1 builds, run through their doors with the real mouse and keyboard. Each test asserts
// an end artifact: the geometry of the window's regions, a computed style, or the stored preferences after an
// immediate reload.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not laid out`);
  return found;
};

const storedPreferences = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('preferences') ?? 'null') as unknown);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('Ctrl+B and Ctrl+Alt+B give the sidebar and the inspector columns to the canvas, and take them back', runs('workspace.toggleLeftDock#key-ctrl-b-in-global', 'workspace.toggleInspector#key-ctrl-alt-b-in-global'), async ({ page }) => {
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

test('Ctrl+\\ collapses every dock and the second Ctrl+\\ puts back exactly what was open', runs('workspace.toggleInspector#menu-view', 'workspace.collapseDocks#key-ctrl-backslash-in-global'), async ({ page }) => {
  // hide the inspector first: the restore must not bring it back
  await runDoor(page, 'workspace.toggleInspector#menu-view');
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

test('View › Workbench opens the dock under the canvas and closes it again', runs('workspace.setPanelOpen#menu-view-workbench'), async ({ page }) => {
  const canvas = await box(page, '.centre');
  await runDoor(page, 'workspace.setPanelOpen#menu-view-workbench');
  const shorter = await box(page, '.centre');
  expect(shorter.height).toBeLessThan(canvas.height);
  const dock = await box(page, '.dock');
  expect(dock.y).toBeGreaterThanOrEqual(shorter.y + shorter.height - 1);

  await runDoor(page, 'workspace.setPanelOpen#menu-view-workbench');
  expect(await box(page, '.centre')).toEqual(canvas);
});

test('a fresh profile opens in Dark whatever the system says; Light survives an immediate reload; System follows the system', runs('preferences.setTheme#menu-theme-light', 'preferences.setTheme#menu-theme-system'), async ({ page }) => {
  const background = () => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  // the system asks for light; a fresh profile is still dark (environment.json theme.default)
  await page.emulateMedia({ colorScheme: 'light' });
  const dark = await background();
  await runDoor(page, 'preferences.setTheme#menu-theme-light');
  const light = await background();
  expect(light).not.toBe(dark);

  await page.reload();
  expect(await background()).toBe(light);
  expect(await storedPreferences(page)).toEqual({ locale: 'en', theme: 'light' });

  await runDoor(page, 'preferences.setTheme#menu-theme-system');
  expect(await background()).toBe(light);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background()).toBe(dark);
});

test('the language menu of the status bar switches the editor to Portuguese and keeps it after reload', runs('preferences.setLanguage#menu-language-pt-br'), async ({ page }) => {
  await runDoor(page, 'preferences.setLanguage#menu-language-pt-br');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(await storedPreferences(page)).toEqual({ locale: 'pt-BR', theme: 'dark' });
  await expect(page.getByRole('button', { name: 'Exibir', exact: true })).toBeVisible();
});
