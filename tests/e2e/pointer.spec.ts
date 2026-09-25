// The pointer owner (src/editor/input/pointer.ts): a press on the canvas opens one gesture, and while it is open the
// keys belong to the gesture (the drag key context), so a global key's door does not run beside it and nothing
// breaks; after the release the keys are the editor's again.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('while a press on the canvas is held, the keys are the gesture\'s; after the release they are the editor\'s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stage = await page.locator('[data-canvas-stage]').boundingBox();
  const frame = await page.locator('.frame').boundingBox();
  if (stage === null || frame === null) throw new Error('the canvas is not laid out');
  const at = { x: (frame.x + frame.width + stage.x + stage.width) / 2, y: frame.y + frame.height / 2 };
  await expect(page.locator('.sidebar')).toHaveCount(1);

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // Ctrl+B (toggle the sidebar, a global key) while the press is held
  await page.keyboard.press('Control+B');
  await page.mouse.up();
  expect(errors, 'no error while a gesture is open').toEqual([]);
  await expect(page.locator('.sidebar'), 'the global key did not run during the gesture').toHaveCount(1);

  await page.keyboard.press('Control+B');
  await expect(page.locator('.sidebar'), 'after the release the global key runs').toHaveCount(0);
  expect(errors).toEqual([]);
});
