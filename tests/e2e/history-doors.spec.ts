// Undo and Redo are built, but nothing built yet changes the document, so there is never anything to undo or redo:
// every door of history.undo and history.redo that a user can reach says so and changes nothing. A drawn door is
// disabled with its reason; a key reports the reason in the status bar. The user's decision on the census: until the
// manifest has a built undoable command, this test stands for Undo and Redo; from then on they need a test through
// these doors that undoes and redoes.
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runDoor, runsUnavailable } from './door.ts';

const DRAWN = ['history.undo#toolbar-top-bar', 'history.undo#menu-edit', 'history.redo#toolbar-top-bar', 'history.redo#menu-edit'];
const KEYS = ['history.undo#key-ctrl-z-in-global', 'history.redo#key-ctrl-shift-z-in-global', 'history.redo#key-ctrl-y-in-global'];
const REASON: Record<string, string> = { 'history.undo': 'Nothing to undo.', 'history.redo': 'Nothing to redo.' };
const reasonOf = (ref: string) => REASON[ref.split('#')[0] ?? ''] ?? '';

// what a door could change: the window's regions and the stored preferences
const snapshot = (page: Page) =>
  page.evaluate(() => ({
    regions: [...document.querySelectorAll('[data-region]')].map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.getAttribute('data-region')} ${r.x} ${r.y} ${r.width} ${r.height}`;
    }),
    stored: window.localStorage.getItem('preferences'),
  }));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('every Undo and Redo door says there is nothing to undo or redo, and changes nothing', runsUnavailable(...DRAWN, ...KEYS), async ({ page }) => {
  const before = await snapshot(page);
  for (const ref of DRAWN) {
    if (ref.includes('#menu-')) await openMenu(page, 'edit');
    const door = page.locator(`[data-door="${ref}"]`);
    await expect(door, ref).toHaveAttribute('aria-disabled', 'true');
    await expect(door, ref).toHaveAttribute('title', new RegExp(reasonOf(ref).replace('.', '\\.')));
    await door.click({ force: true });
    await page.keyboard.press('Escape');
    expect(await snapshot(page), ref).toEqual(before);
  }
  const status = page.getByRole('status');
  for (const ref of KEYS) {
    await runDoor(page, ref);
    await expect(status, ref).toHaveText(reasonOf(ref));
    expect(await snapshot(page), ref).toEqual(before);
  }
});
