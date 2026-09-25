// Menus without key or pointer listeners of their own: the keys of an open menu are the doors of the "menu" key
// context, run by the keymap and carried out by the focus owner (focus.next, focus.previous, focus.first, focus.last,
// focus.activate) and by ui.dismiss (Escape); a press outside an open menu lands on the backdrop, the door
// ui.dismiss#overlay-backdrop. A press on the menu's own background keeps it open, and a submenu shows while the
// pointer is over its item.
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runs } from './door.ts';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

// the labels of an open menu's own items, and the one that has the focus
const items = (page: Page, menu: string) =>
  page.getByRole('menu', { name: menu }).evaluate((list) => {
    const own = [...list.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter((el) => el.closest('[role="menu"]') === list);
    return { labels: own.map((el) => el.querySelector('.menu__label')?.textContent ?? ''), focused: own.findIndex((el) => el === document.activeElement) };
  });

test('ArrowDown moves the focus to the next item of the menu, and from the last back to the first', runs('focus.next#key-arrow-down-in-menu'), async ({ page }) => {
  await openMenu(page, 'file');
  const { labels } = await items(page, 'File');
  expect((await items(page, 'File')).focused).toBe(0);
  await page.keyboard.press('ArrowDown');
  expect((await items(page, 'File')).focused).toBe(1);
  for (let i = 1; i < labels.length; i += 1) await page.keyboard.press('ArrowDown');
  expect((await items(page, 'File')).focused).toBe(0);
});

test('ArrowUp moves the focus to the previous item, and from the first to the last', runs('focus.previous#key-arrow-up-in-menu'), async ({ page }) => {
  await openMenu(page, 'file');
  const { labels } = await items(page, 'File');
  await page.keyboard.press('ArrowUp');
  expect((await items(page, 'File')).focused).toBe(labels.length - 1);
  await page.keyboard.press('ArrowUp');
  expect((await items(page, 'File')).focused).toBe(labels.length - 2);
});

test('End moves the focus to the last item and Home back to the first', runs('focus.last#key-end-in-menu', 'focus.first#key-home-in-menu'), async ({ page }) => {
  await openMenu(page, 'file');
  const { labels } = await items(page, 'File');
  await page.keyboard.press('End');
  expect((await items(page, 'File')).focused).toBe(labels.length - 1);
  await page.keyboard.press('Home');
  expect((await items(page, 'File')).focused).toBe(0);
});

test('Enter runs the focused item: View › Inspector gives the inspector column to the canvas', runs('focus.activate#key-enter-in-menu'), async ({ page }) => {
  await expect(page.locator('[data-region="inspector-header"]')).toHaveCount(1);
  await openMenu(page, 'view');
  const { labels } = await items(page, 'View');
  const at = labels.indexOf('Inspector');
  expect(at, 'View has an Inspector item').toBeGreaterThanOrEqual(0);
  // the focus reaches the item by the keyboard, as a person moves it
  for (let i = 0; i < at; i += 1) await page.keyboard.press('ArrowDown');
  expect((await items(page, 'View')).focused).toBe(at);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'View' })).toHaveCount(0);
  await expect(page.locator('[data-region="inspector-header"]')).toHaveCount(0);
});

test('Escape closes the open menu and gives the focus back to the button that opened it', runs('ui.dismiss#key-escape-in-menu'), async ({ page }) => {
  await openMenu(page, 'file');
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  // the focus is on the menu's first item when Escape is pressed
  expect((await items(page, 'File')).focused).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);
  // WAI-ARIA menu button: the focus returns to the File button, never to the page body
  await expect(page.locator('.menu-button[data-menu="file"]')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test('a press outside an open menu lands on its backdrop and closes it; a press on its own background keeps it open', runs('ui.dismiss#overlay-backdrop'), async ({ page }) => {
  const file = page.getByRole('menu', { name: 'File' });
  await openMenu(page, 'file');
  await expect(file).toBeVisible();
  // the menu's own padding, beside its first item
  const box = await file.boundingBox();
  if (box === null) throw new Error('the File menu is not laid out');
  await page.mouse.click(box.x + 2, box.y + 2);
  await expect(file).toBeVisible();
  // the status bar's message area, under the backdrop now
  const status = await page.getByRole('status').boundingBox();
  if (status === null) throw new Error('the status bar has no message area');
  const at = { x: status.x + 4, y: status.y + status.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-door'), at)).toBe('ui.dismiss#overlay-backdrop');
  await page.mouse.click(at.x, at.y);
  await expect(file).toHaveCount(0);

  // the stage around the page, right of the frame (the View menu drops over its left side)
  await openMenu(page, 'view');
  await expect(page.getByRole('menu', { name: 'View' })).toBeVisible();
  const stage = await page.locator('[data-canvas-stage]').boundingBox();
  const frame = await page.locator('.frame').boundingBox();
  if (stage === null || frame === null) throw new Error('the canvas is not laid out');
  await page.mouse.click((frame.x + frame.width + stage.x + stage.width) / 2, frame.y + frame.height / 2);
  await expect(page.getByRole('menu', { name: 'View' })).toHaveCount(0);
});

test('a submenu shows while the pointer is over its item and hides when the pointer leaves it', async ({ page }) => {
  await openMenu(page, 'view');
  const theme = page.getByRole('menu', { name: 'Theme' });
  await expect(theme).toBeHidden();
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).hover();
  await expect(theme).toBeVisible();
  await expect(theme.getByRole('menuitemradio', { name: 'Light' })).toBeVisible();
  // over the View menu's first item, away from the submenu
  await page.getByRole('menu', { name: 'View' }).getByRole('menuitem').first().hover();
  await expect(theme).toBeHidden();
});
