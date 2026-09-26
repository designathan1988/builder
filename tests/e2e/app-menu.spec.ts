// app-menu beyond its scenarios (spec/behavior/app-menu.md): a menu opened from its button takes the focus on its
// first item, the arrows move the focus, and Escape closes the menu and gives the focus back to its button (Enter on
// the button is keyboard-panel-navigation's, finding 48); with nothing selected, Arrange's items that need a
// selection are disabled and say why (Problems in Pager 4), and a click on one changes nothing.
import { expect, test } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runs } from './door.ts';

const DUPLICATE = 'element.duplicate#menu-edit';
const MOVE_UP = 'element.moveUp#menu-arrange';
type Port = { document: () => unknown };
const documentNow = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.stringify((window as unknown as { __builderTestPort: Port }).__builderTestPort.document()));

test('an open menu moves and closes from the keyboard, and gives the focus back to its button', runs(), async ({ page }) => {
  await openEditor(page);
  const edit = page.locator('.menu-button[data-menu="edit"]');
  await edit.click();
  const items = page.locator('[role="menu"] [role^="menuitem"]');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('with nothing selected, a menu item that needs a selection is disabled, says why, and does nothing', runs(MOVE_UP, DUPLICATE), async ({ page }) => {
  await openEditor(page);
  const before = await documentNow(page);
  await page.locator('.menu-button[data-menu="arrange"]').click();
  const moveUp = page.locator(`[data-door="${MOVE_UP}"]`);
  await expect(moveUp).toHaveAttribute('aria-disabled', 'true');
  const reason = await moveUp.getAttribute('title');
  expect(reason ?? '').not.toBe('');
  expect(reason).not.toContain('not available yet');
  await moveUp.click({ force: true });
  expect(await documentNow(page)).toBe(before);
});
