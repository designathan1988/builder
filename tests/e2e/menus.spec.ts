// Menus without pointer listeners of their own (pointer input belongs to src/editor/input/pointer.ts): an open menu
// closes when a press outside takes the focus away, stays open for a press on its own background, and a submenu
// shows while the pointer is over its item and hides when the pointer leaves it.
import { expect, test } from '@playwright/test';
import { openMenu } from './door.ts';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('a press outside an open menu closes it, and a press on its own background keeps it open', async ({ page }) => {
  const file = page.getByRole('menu', { name: 'File' });
  await openMenu(page, 'file');
  await expect(file).toBeVisible();
  // the menu's own padding, beside its first item
  const box = await file.boundingBox();
  if (box === null) throw new Error('the File menu is not laid out');
  await page.mouse.click(box.x + 2, box.y + 2);
  await expect(file).toBeVisible();
  // the status bar's message is no control: the press takes the focus out of the menu
  const status = await page.getByRole('status').boundingBox();
  if (status === null) throw new Error('the status bar has no message area');
  await page.mouse.click(status.x + 4, status.y + status.height / 2);
  await expect(file).toHaveCount(0);

  await openMenu(page, 'view');
  await expect(page.getByRole('menu', { name: 'View' })).toBeVisible();
  // the stage around the page, right of the frame (the View menu drops over its left side)
  const stage = await page.locator('[data-canvas-stage]').boundingBox();
  const frame = await page.locator('.frame').boundingBox();
  if (stage === null || frame === null) throw new Error('the canvas is not laid out');
  const at = { x: (frame.x + frame.width + stage.x + stage.width) / 2, y: frame.y + frame.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute('data-canvas-stage'), at)).toBe(true);
  await page.mouse.click(at.x, at.y);
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
