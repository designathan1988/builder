// Group 11 beyond its scenarios (spec/behavior/breakpoints-switch.md, breakpoint-overrides.md, state-styles.md):
//  - the breakpoint shown is kept after a reload, the page drawn at its width;
//  - at Tablet a field whose value is set there says so, and one it inherits names Desktop;
//  - while Hover is edited the canvas badge reads "Editing Hover"; in the exported page, hovering the element changes
//    its computed colour (the page and its stylesheet, as the ZIP holds them, loaded in the browser).
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const TABLET = 'view.setBreakpoint#toolbar-breakpoint-tabs-tablet';
const FONT = 'style.set#inspector-font-size';
const COLOR = 'style.set#inspector-color';
const HOVER = 'view.setStyleState#menu-style-state-hover';
const EXPORT = 'project.export#toolbar-top-bar-export';

async function openAurora(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
}
const pageWidth = (page: Page) => page.locator('.frame__page').evaluate((frame) => (frame as HTMLIFrameElement).contentWindow?.innerWidth ?? 0);
async function typeInto(page: Page, ref: string, text: string): Promise<void> {
  const field = control(page, ref).locator('input').first();
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`${text}\n`);
}

test('the breakpoint shown is kept after a reload, and a field says where its value comes from', runs(OPEN, ROW, TABLET, FONT), async ({ page }) => {
  await openAurora(page);
  await runDoor(page, TABLET);
  expect(await pageWidth(page)).toBe(834);
  await page.reload();
  await page.locator('.workbench').waitFor();
  expect(await pageWidth(page)).toBe(834);
  await expect(page.locator(`[data-door="${TABLET}"]`)).toHaveAttribute('aria-selected', 'true');

  await control(page, ROW, { args: { target: 'n-title' } }).click();
  // the inspector names the breakpoint the editor edits, never the base one while another is shown
  await expect(page.locator('.active-breakpoint')).toHaveText('Tablet834');
  // Title's font size is set nowhere yet; its padding neither: no origin note
  const origin = page.locator(`.field-origin[data-field="${FONT}"]`);
  await expect(origin).toHaveCount(0);
  await typeInto(page, FONT, '24');
  await expect(origin).toHaveAttribute('data-origin', 'here');
  await expect(origin).toHaveText('Set at Tablet');
  // Intro's colour set at Desktop is inherited at Tablet
  await runDoor(page, 'view.setBreakpoint#toolbar-breakpoint-tabs-desktop');
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await typeInto(page, COLOR, '#aa0000');
  await runDoor(page, TABLET);
  const inherited = page.locator(`.field-origin[data-field="${COLOR}"]`);
  await expect(inherited).toHaveAttribute('data-origin', 'breakpoint');
  await expect(inherited).toHaveText('From Desktop');
});

test('while Hover is edited the canvas says so, and the exported page changes on hover', runs(OPEN, ROW, HOVER, COLOR, EXPORT), async ({ page, browser }) => {
  await openAurora(page);
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await runDoor(page, HOVER);
  await expect(page.locator('[data-canvas-badge="state"]')).toHaveText('Editing Hover');
  await expect(page.locator('.state-picker__value')).toHaveText('Hover');
  await typeInto(page, COLOR, '#aa0000');
  const downloaded = page.waitForEvent('download');
  await runDoor(page, EXPORT);
  const files = unzip(fs.readFileSync(await (await downloaded).path()));
  const html = files.get('index.html')?.toString('utf8') ?? '';
  const css = files.get('css/styles.css')?.toString('utf8') ?? '';
  expect(css).toContain(':hover');
  // the exported page with its stylesheet, as a browser opens it
  const exported = await browser.newPage();
  await exported.route('**/css/styles.css', (route) => route.fulfill({ contentType: 'text/css', body: css }));
  await exported.route('https://export.test/', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await exported.goto('https://export.test/');
  const intro = exported.locator('p').first();
  const before = await intro.evaluate((el) => getComputedStyle(el).color);
  await intro.hover();
  await expect.poll(() => intro.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(170, 0, 0)');
  expect(before).not.toBe('rgb(170, 0, 0)');
  await exported.close();
});
