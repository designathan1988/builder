// inspector-property-search beyond its scenarios (spec/behavior/inspector-property-search.md; the user's real-use
// audit, item 1.2): what the Style tab draws while Find a property holds a query. Typing a label or a CSS name keeps
// only the matching fields, a section with none not drawn; no match says so; emptying the field brings every section
// back, a collapsed one collapsed again. The fields are read in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const SEARCH = 'inspector.search#inspector-search-field';
const HEADER = 'inspector.toggleSection#inspector-section-header';

const style = (page: Page) => page.locator('[data-region="inspector-style"]');
// the sections drawn and the fields of each, by the door each field is drawn by (not the parts of the field component:
// its step buttons, unit menu, label scrub and Reset, the section's header)
const drawn = (page: Page) =>
  style(page)
    .locator('.inspector-section')
    .evaluateAll((sections) =>
      sections.map((s) => ({
        section: s.getAttribute('aria-label') ?? '',
        fields: [...s.querySelectorAll('[data-door]')].map((el) => el.getAttribute('data-door') ?? '').filter((ref) => !ref.startsWith('inspector.toggleSection#') && !ref.startsWith('field.') && !ref.startsWith('style.reset#')),
      })),
    );
async function search(page: Page, text: string): Promise<void> {
  const field = control(page, SEARCH).locator('input');
  await field.click();
  await page.keyboard.press('Control+A');
  if (text === '') await page.keyboard.press('Backspace');
  else await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
});

test('typing a label keeps only its field, in its section', runs(OPEN, ROW, SEARCH), async ({ page }) => {
  const all = await drawn(page);
  expect(all.length).toBeGreaterThan(4);
  await search(page, 'letter');
  await expect.poll(() => drawn(page)).toEqual([{ section: 'Text', fields: ['style.set#inspector-letter-spacing'] }]);
});

test('a CSS name finds its field, and no match says so', runs(OPEN, ROW, SEARCH), async ({ page }) => {
  await search(page, 'text-transform');
  await expect.poll(() => drawn(page)).toEqual([{ section: 'Text', fields: ['style.set#inspector-text-transform'] }]);
  await search(page, 'zzz');
  await expect(style(page).locator('.inspector-section')).toHaveCount(0);
  await expect(style(page).locator('.inspector-search__none')).toHaveText('No property matches "zzz".');
});

test('emptying the field brings every section back as it was, a collapsed one collapsed', runs(OPEN, ROW, SEARCH, HEADER), async ({ page }) => {
  await control(page, HEADER, { args: { section: 'text' } }).click();
  const before = await drawn(page);
  expect(before.find((s) => s.section === 'Text')?.fields).toEqual([]);
  await search(page, 'letter');
  await expect.poll(() => drawn(page)).toEqual([{ section: 'Text', fields: ['style.set#inspector-letter-spacing'] }]);
  await search(page, '');
  await expect.poll(() => drawn(page)).toEqual(before);
});
