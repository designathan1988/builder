// inspector-provenance-reset beyond its scenarios (spec/behavior/inspector-provenance-reset.md, Problems in Pager 1): a
// section's header counts the values the element holds in it, beside its summary, and the count follows a reset.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const COLOR = 'style.set#inspector-color';
const FONT_SIZE = 'style.set#inspector-font-size';
const RESET = 'style.reset#inspector-property-reset';
const SECTION = 'inspector.toggleSection';

async function type(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
// the count the Text section's header shows, or null while it shows none
const textCount = (page: Page) =>
  page
    .locator(`[data-door^="${SECTION}#"][data-args*='"section":"text"'] .inspector-section__count`)
    .evaluateAll((els) => (els[0] as HTMLElement | undefined)?.textContent ?? null);

test('the Text section counts the values set in it, and a reset takes one off', runs(OPEN, ROW, COLOR, FONT_SIZE, RESET), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await expect.poll(() => textCount(page)).toBeNull();
  await type(page, COLOR, '#ff0000');
  await type(page, FONT_SIZE, '24px');
  await expect.poll(() => textCount(page)).toBe('2 set');
  await control(page, RESET, { args: { property: 'color' } }).click();
  await expect.poll(() => textCount(page)).toBe('1 set');
});
