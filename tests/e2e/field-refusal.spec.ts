// A refused value is said beside its field (spec inspector-number-fields, Problems in Pager 3; the user's real-use audit,
// item 1.6): typing "abc" in Font size puts the field in the error outline with a short text under it, the field shows
// the value it had and the document keeps it; typing again takes the text away. What was typed is quoted once, the
// quick panel's Effects as any field ('Filter: "2"…', never '""2""'). The document is read through the test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, openQuickPanel, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const FONT_SIZE = 'style.set#inspector-font-size';
const EFFECTS = 'style.setFilter#quick-panel-effects';

const introStyles = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort;
    const doc = p?.document() as { pages: { tree: { children: { id: string; children: { id: string; styles: Record<string, Record<string, Record<string, unknown>>> }[] }[] } }[] };
    return doc.pages[0]?.tree.children.find((c) => c.id === 'n-hero')?.children.find((c) => c.id === 'n-intro')?.styles.desktop?.base ?? {};
  });
async function typeInto(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
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

test('a refused font size is said beside its field, the field shows the value it had, and typing takes it away', runs(OPEN, ROW, FONT_SIZE), async ({ page }) => {
  const field = control(page, FONT_SIZE);
  await typeInto(page, FONT_SIZE, '20px');
  await expect.poll(() => introStyles(page)).toEqual({ 'font-size': '20px' });
  await typeInto(page, FONT_SIZE, 'abc');
  await expect(field.locator('.field-row__refusal')).toHaveText('"abc" is not a value this field takes.');
  await expect(field.locator('input').first()).toHaveAttribute('aria-invalid', 'true');
  await expect(field.locator('input').first()).toHaveValue('20px');
  await expect(page.getByRole('status')).toHaveText('Font size: "abc" is not a value this field takes.');
  expect(await introStyles(page)).toEqual({ 'font-size': '20px' });
  await page.keyboard.type('2');
  await expect(field.locator('.field-row__refusal')).toHaveCount(0);
  await expect(field.locator('input').first()).not.toHaveAttribute('aria-invalid', 'true');
});

test('the quick panel Effects quotes what was typed once, in its field and in the status bar', runs(OPEN, ROW, EFFECTS), async ({ page }) => {
  await openQuickPanel(page);
  await typeInto(page, EFFECTS, '2');
  await expect(page.getByRole('status')).toHaveText('Filter: "2" is not a value this field takes.');
  await expect(control(page, EFFECTS).locator('.field-row__refusal')).toHaveText('"2" is not a value this field takes.');
  expect(await introStyles(page)).toEqual({});
});
