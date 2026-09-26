// props-typography-advanced beyond its scenarios (spec/behavior/props-typography-advanced.md, Problems in Pager 1): the
// line clamp is drawn through its whole recipe, so the text is cut at the lines asked: its prefixed declarations reach
// the page (the scenarios cannot name them) and the paragraph is as tall as two of its lines. The document is read
// through the read-only test port, the layout inside the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const WIDTH = 'style.set#inspector-width';
const CLAMP = 'style.set#inspector-line-clamp';

const intro = (page: Page) => page.frameLocator('.frame__page').locator('[data-node="n-intro"]');

async function type(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a line clamp cuts the text at the lines asked', runs(OPEN, ROW, WIDTH, CLAMP), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(intro(page)).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await page.keyboard.press('Control+0');
  // narrow enough for the sentence to take several lines
  await type(page, WIDTH, '60px');
  const heightOf = () => intro(page).evaluate((el) => el.getBoundingClientRect().height);
  await expect.poll(() => intro(page).evaluate((el) => getComputedStyle(el).width)).toBe('60px');
  const whole = await heightOf();
  // one line, then two: the paragraph is as tall as the lines asked, and shorter than its whole text
  await type(page, CLAMP, '1');
  await expect.poll(() => intro(page).evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-line-clamp'))).toBe('1');
  const line = await heightOf();
  await type(page, CLAMP, '2');
  await expect.poll(() => intro(page).evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-line-clamp'))).toBe('2');
  expect(await intro(page).evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-box-orient'))).toBe('vertical');
  const two = await heightOf();
  expect(whole, `the whole text (${whole}px) takes more than two lines of ${line}px`).toBeGreaterThan(line * 2.5);
  expect(Math.abs(two - line * 2), `two lines of ${line}px, drawn ${two}px`).toBeLessThan(1);
});

// The Line clamp field shows the value the page computes while the element holds none; the name is a recipe's, which
// the browser computes no property of: reading it must not throw on the page (it did, at every frame, from the field's
// measure).
test('the Line clamp field of an element with no clamp raises no error on the page', runs(OPEN, ROW), async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(intro(page)).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await expect(control(page, CLAMP).locator('input')).toHaveValue('');
  // a few frames of the fields' measures
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  expect(errors).toEqual([]);
});
