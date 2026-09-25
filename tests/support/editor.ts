// Opening the editor for a browser test, in one place (docs/testing/README.md): every test runs in a new browser
// context, a fresh profile with nothing stored, so the editor is loaded once. The tests used to load it, clear its
// storage and load it again (37 copies of the same three lines), which cost 11% of the scenario tests' CPU; the
// fresh profile is now proven instead of assumed: what the page had stored before any of its scripts ran is read.
import { expect, type Page } from '@playwright/test';

const STORED_AT_START = '__storedAtStart';

export async function openEditor(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    // before the editor's own scripts: what a previous load of this profile would have left
    (window as unknown as Record<string, unknown>)[key] = { local: window.localStorage.length, session: window.sessionStorage.length };
  }, STORED_AT_START);
  await page.goto('/');
  const stored = await page.evaluate((key) => (window as unknown as Record<string, unknown>)[key], STORED_AT_START);
  expect(stored, 'the editor opens in a fresh profile: nothing was stored before it loaded').toEqual({ local: 0, session: 0 });
}
