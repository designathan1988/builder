// theme-switch beyond its scenarios (spec/behavior/theme-switch.md): with System chosen, the editor follows the
// browser's colour scheme live (no reload), and the page inside the frame keeps its own colours whatever the theme.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const SYSTEM = 'preferences.setTheme#menu-theme-system';
const LIGHT = 'preferences.setTheme#menu-theme-light';
const topBar = (page: Page) => page.locator('[data-region="top-bar"]').evaluate((el) => getComputedStyle(el).backgroundColor);
const pageBackground = (page: Page) => page.locator('.frame__page').evaluate((frame) => getComputedStyle((frame as HTMLIFrameElement).contentDocument?.body ?? document.body).backgroundColor);

test('System follows the browser scheme live, and the page keeps its own colours', runs(SYSTEM, LIGHT), async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openEditor(page);
  await runDoor(page, SYSTEM);
  await expect.poll(() => topBar(page)).toBe('rgb(247, 248, 250)');
  const light = await pageBackground(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => topBar(page)).toBe('rgb(21, 24, 29)');
  expect(await pageBackground(page)).toBe(light);
  // Light holds whatever the browser's scheme
  await runDoor(page, LIGHT);
  await expect.poll(() => topBar(page)).toBe('rgb(247, 248, 250)');
  expect(await pageBackground(page)).toBe(light);
});
