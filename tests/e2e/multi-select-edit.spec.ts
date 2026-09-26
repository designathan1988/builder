// multi-select-edit beyond its scenarios (spec/behavior/multi-select-edit.md): with several elements selected, a field
// whose values differ between them shows no value and "Mixed", the colour fields as every other (Problems in Pager 1);
// a field whose values are the same shows the value; once a value is written to all of them, the field shows it. The
// scenarios cannot say what a field shows: this test reads the inspector's inputs in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ADD = 'selection.add#layers-row-shift';
const FONT_SIZE = 'style.set#inspector-font-size';
const COLOR = 'style.set#inspector-color';
const WEIGHT = 'style.set#inspector-font-weight';

const input = (page: Page, ref: string) => control(page, ref).locator('input').first();

async function type(page: Page, ref: string, text: string): Promise<void> {
  await input(page, ref).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('several selected elements show Mixed where their values differ, and the value once it is the same', runs(OPEN, ROW, ADD, FONT_SIZE, COLOR), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  // one element: its own values; Intro takes a colour of its own
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await type(page, COLOR, '#ff0000');
  await expect(input(page, COLOR)).toHaveValue('#ff0000');
  // one element holding no size of its own: an empty field, the size it has as the placeholder (the user's real-use
  // audit, item 1.1: a field shows the document's value; spec inspector-provenance-reset, Problems in Pager 4)
  await control(page, ROW, { args: { target: 'n-title' } }).click();
  await expect(input(page, FONT_SIZE)).toHaveValue('');
  await expect(input(page, FONT_SIZE)).toHaveAttribute('placeholder', '32px');
  // Title (an h1) and Intro (a red paragraph): different sizes, colours and weights
  await control(page, ROW, { args: { target: 'n-intro' } }).click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __builderTestPort: { selection: () => string[] } }).__builderTestPort.selection())).length).toBe(2);
  for (const ref of [FONT_SIZE, COLOR, WEIGHT]) {
    await expect(input(page, ref), ref).toHaveValue('');
    await expect(input(page, ref), ref).toHaveAttribute('placeholder', 'Mixed');
  }
  // a size written to both: the field shows it, no longer Mixed
  await type(page, FONT_SIZE, '20px');
  await expect(input(page, FONT_SIZE)).toHaveValue('20px');
  await expect(input(page, FONT_SIZE)).not.toHaveAttribute('placeholder', 'Mixed');
  // the colour still differs
  await expect(input(page, COLOR)).toHaveAttribute('placeholder', 'Mixed');
});
