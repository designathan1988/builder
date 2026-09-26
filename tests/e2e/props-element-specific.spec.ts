// props-element-specific beyond its scenarios (spec/behavior/props-element-specific.md): a field of a kind of element
// (a list's, a table's, a form control's, a medium's) is drawn only while every selected element is of that kind, and
// Add a property does not offer it for an element it does not apply to. The scenarios cannot say a field is not drawn:
// this test does, on the Style tab of the inspector in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ADD = 'selection.add#layers-row-shift';
const ESSENTIALS = 'inspector.setMode#inspector-mode-essentials';
const REVEAL = 'inspector.reveal#inspector-add-property-item';
const LIST_TYPE = 'style.set#inspector-list-style-type';
const LIST_IMAGE = 'style.set#inspector-list-style-image';
const COLLAPSE = 'style.set#inspector-border-collapse';
const FIT = 'style.set#inspector-object-fit';
const ACCENT = 'style.set#inspector-accent-color';
const WIDTH = 'style.set#inspector-width';

const drawn = (page: Page, ref: string) => page.locator(`[data-region="inspector-style"] [data-door="${ref}"]`);
const select = async (page: Page, target: string) => control(page, ROW, { args: { target } }).click();

async function openAurora(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
}

test('a list draws its marker fields and no table, media or form field; a section draws none of them', runs(OPEN, ROW, ADD, LIST_TYPE), async ({ page }) => {
  await openAurora(page);
  // the list: its marker fields, and none of another kind
  await select(page, 'n-perks');
  await expect(drawn(page, WIDTH)).toHaveCount(1);
  await expect(drawn(page, LIST_TYPE)).toHaveCount(1);
  await expect(drawn(page, LIST_IMAGE)).toHaveCount(1);
  for (const ref of [COLLAPSE, FIT, ACCENT]) await expect(drawn(page, ref), ref).toHaveCount(0);
  // the list and a section together: the section is no list, so the marker fields go
  await control(page, ROW, { args: { target: 'n-plans' } }).click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __builderTestPort: { selection: () => string[] } }).__builderTestPort.selection())).length).toBe(2);
  await expect(drawn(page, LIST_TYPE)).toHaveCount(0);
  await expect(drawn(page, WIDTH)).toHaveCount(1);
  // a section alone: no field of a kind
  await select(page, 'n-hero');
  await expect(drawn(page, WIDTH)).toHaveCount(1);
  for (const ref of [LIST_TYPE, LIST_IMAGE, COLLAPSE, FIT, ACCENT]) await expect(drawn(page, ref), ref).toHaveCount(0);
});

test('add a property offers a list property for a list and not for a section', runs(OPEN, ROW, ESSENTIALS, REVEAL), async ({ page }) => {
  await openAurora(page);
  await runDoor(page, ESSENTIALS);
  const item = (property: string) => page.locator(`[data-door="${REVEAL}"][data-args*='"property":"${property}"']`);
  const openList = async () => {
    await page.locator('.add-property > button').click();
    await expect(page.locator('.add-property__menu')).toBeVisible();
  };
  await select(page, 'n-hero');
  await openList();
  await expect(item('word-spacing')).toHaveCount(1);
  await expect(item('list-style-type')).toHaveCount(0);
  // the list closed by its button
  await page.locator('.add-property > button').click();
  await expect(page.locator('.add-property__menu')).toHaveCount(0);
  await select(page, 'n-perks');
  await openList();
  await expect(item('list-style-type')).toHaveCount(1);
  await expect(item('border-collapse')).toHaveCount(0);
  // choosing it draws its field
  await item('list-style-type').click();
  await expect(drawn(page, LIST_TYPE)).toHaveCount(1);
});
