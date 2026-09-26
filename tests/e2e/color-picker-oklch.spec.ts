// color-picker-oklch beyond its scenarios (spec/behavior/color-picker-oklch.md): a colour outside sRGB is kept and the
// picker says it shows the nearest sRGB colour (Problems in Pager 4), a colour inside says nothing; a named colour and
// an oklch() colour typed in the text field show their channels in RGB and OKLCH from the same colour (Problems in
// Pager 5). The scenarios cannot say what the picker shows: this test reads its fields in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const SWATCH = 'colorPicker.open#field-color-swatch';
const VALUE = 'style.set#color-picker-value';
const RGB = 'colorPicker.setFormat#color-picker-format-rgb';
const OKLCH = 'colorPicker.setFormat#color-picker-format-oklch';
const CHANNEL = 'colorPicker.setChannel#color-picker-channel';
const BG = 'background-color';

async function typeColour(page: Page, colour: string): Promise<void> {
  const field = page.locator(`[data-door="${VALUE}"] input`);
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(colour);
  await page.keyboard.press('Enter');
}
const channel = (page: Page, name: string) => control(page, CHANNEL, { args: { property: BG, channel: name } }).locator('input');
const warning = (page: Page) => page.locator('[data-region="color-picker"] [data-gamut-warning]');

test('the picker reads every syntax as one colour and says when it lies outside sRGB', runs(OPEN, ROW, SWATCH, VALUE, RGB, OKLCH), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-actions' } }).click();
  await control(page, SWATCH, { args: { property: BG } }).click();
  // a named colour: the page computes it, the RGB channels show it
  await typeColour(page, 'rebeccapurple');
  await runDoor(page, RGB);
  await expect(channel(page, 'r')).toHaveValue('102');
  await expect(channel(page, 'g')).toHaveValue('51');
  await expect(channel(page, 'b')).toHaveValue('153');
  await expect(warning(page)).toHaveCount(0);
  // an oklch() colour inside sRGB: its OKLCH channels as typed, no note
  await typeColour(page, 'oklch(70% 0.15 260)');
  await runDoor(page, OKLCH);
  await expect(channel(page, 'ok-l')).toHaveValue('70');
  await expect(channel(page, 'ok-c')).toHaveValue('0.15');
  await expect(channel(page, 'ok-h')).toHaveValue('260');
  await expect(warning(page)).toHaveCount(0);
  // a chroma sRGB cannot show: kept, and the picker says it shows the nearest colour
  await typeColour(page, 'oklch(70% 0.4 150)');
  await expect(channel(page, 'ok-c')).toHaveValue('0.4');
  await expect(warning(page)).toHaveText('Outside sRGB: the area shows the nearest colour it can.');
});
