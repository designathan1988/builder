// inspector-advanced-mode beyond its scenarios (spec/behavior/inspector-advanced-mode.md): Essentials only leaves out the
// fields of the properties that are no essentials, keeps a field whose property the element holds a value of, and All
// properties draws every field again; the mode stays after a reload (Problems in Pager 1). The scenarios cannot say a
// field is not drawn: this test does, on the Style tab of the inspector in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ESSENTIALS = 'inspector.setMode#inspector-mode-essentials';
const ALL = 'inspector.setMode#inspector-mode-all';
const WORD_SPACING = 'style.set#inspector-word-spacing';
const LETTER_SPACING = 'style.set#inspector-letter-spacing';
const FONT_SIZE = 'style.set#inspector-font-size';

const drawn = (page: Page, ref: string) => page.locator(`[data-region="inspector-style"] [data-door="${ref}"]`);

async function selectIntro(page: Page): Promise<void> {
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await expect(drawn(page, FONT_SIZE)).toHaveCount(1);
}

test('essentials only leaves out what is no essential, keeps what holds a value, and all brings it back after a reload', runs(OPEN, ROW, ESSENTIALS, ALL, LETTER_SPACING), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await selectIntro(page);
  // a fresh profile shows every property
  await expect(drawn(page, WORD_SPACING)).toHaveCount(1);
  // a value set on letter spacing, then Essentials only: word spacing goes, letter spacing (set) and font size stay
  const field = drawn(page, LETTER_SPACING).locator('input');
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2px');
  await page.keyboard.press('Enter');
  await runDoor(page, ESSENTIALS);
  await expect(drawn(page, WORD_SPACING)).toHaveCount(0);
  await expect(drawn(page, LETTER_SPACING)).toHaveCount(1);
  await expect(drawn(page, FONT_SIZE)).toHaveCount(1);
  // the mode stays after a reload
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await selectIntro(page);
  await expect(drawn(page, WORD_SPACING)).toHaveCount(0);
  // All properties draws every field again
  await runDoor(page, ALL);
  await expect(drawn(page, WORD_SPACING)).toHaveCount(1);
});
