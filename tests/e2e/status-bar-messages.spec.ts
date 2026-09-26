// The status bar's messages (DESIGN.md "Dock and status bar"; the audit's A3.41): a refusal's message goes with the
// next action, even one that says nothing of its own (a Layers branch folded); every preference change says what it
// set, the preference and the value by their labels, in the language shown (the theme, a view switch on and off, the
// language itself). The status bar is the end artifact here: what it says is the feature.
import fs from 'node:fs';
import { expect, test } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const WIDTH = 'style.set#inspector-width';
const CARET = 'layers.setExpanded#layers-caret';
const LIGHT = 'preferences.setTheme#menu-theme-light';
const DARK = 'preferences.setTheme#menu-theme-dark';
const OUTLINES = 'view.toggleOutlines#canvas-tools-outlines';
const PORTUGUESE = 'preferences.setLanguage#menu-language-pt-br';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
});

test('a refusal is replaced by the next action, even one that says nothing of its own', runs(OPEN, ROW, WIDTH, CARET), async ({ page }) => {
  const status = page.getByRole('status');
  await control(page, ROW, { args: { target: 'n-grid' } }).click();
  await control(page, WIDTH).locator('input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('banana');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('banana');
  await control(page, CARET, { args: { target: 'n-hero' } }).click();
  await expect(status).toHaveText('');
});

test('a preference change says what it set: the theme, a view switch on and off, the language', runs(OPEN, LIGHT, DARK, OUTLINES, PORTUGUESE), async ({ page }) => {
  const status = page.getByRole('status');
  // light, then dark: at least one of them changes the theme, whichever the profile starts with
  await runDoor(page, LIGHT);
  await expect(status).toHaveText('Theme: Light.');
  await runDoor(page, DARK);
  await expect(status).toHaveText('Theme: Dark.');
  await runDoor(page, OUTLINES);
  await expect(status).toHaveText('Outlines: on.');
  await runDoor(page, OUTLINES);
  await expect(status).toHaveText('Outlines: off.');
  await runDoor(page, PORTUGUESE);
  await expect(status).toHaveText('Idioma: Português (Brasil).');
});
