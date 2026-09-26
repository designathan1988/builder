// shared-style-classes beyond its scenarios (spec/behavior/shared-style-classes.md): the selector bar says how far a
// class target reaches; with the Element target, a field whose value comes from a class names the class, until the
// element holds a value of its own; the Styles view lists the classes with how many elements have each; a new selection
// returns the target to Element. The scenarios cannot say what the inspector and the Styles view show: this test reads
// them in Chrome, after the document holds what they describe.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const SAVE = 'classes.create#inspector-class-save-as';
const APPLY = 'classes.apply#inspector-class-add';
const CHIP = 'inspector.setStyleTarget#inspector-class-bar-target';
const BG = 'style.set#inspector-background-color';
const STYLES = 'workspace.setPanelOpen#toolbar-activity-bar-styles';

type Port = { document: () => { classes?: { name: string; styles: unknown }[] } };
const classesNow = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: Port }).__builderTestPort.document().classes ?? []);

async function typeInto(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a class target says its reach, a class value is named on the element, the Styles view counts, a new selection returns to Element', runs(OPEN, ROW, SAVE, APPLY, CHIP, BG, STYLES), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  // Hero's styles saved as band, applied to Plans
  await control(page, ROW, { args: { target: 'n-hero' } }).click();
  await control(page, SAVE).click();
  await page.keyboard.type('band');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await classesNow(page)).map((c) => c.name)).toEqual(['band']);
  await control(page, ROW, { args: { target: 'n-plans' } }).click();
  await control(page, APPLY).click();
  await control(page, APPLY, { args: { className: 'band' } }).click();
  // the class as the target: its reach
  const bandChip = control(page, CHIP, { args: { target: 'class', className: 'band' } });
  await bandChip.click();
  await expect(bandChip).toHaveClass(/is-current/);
  await expect(page.locator('[data-region="inspector-selector-bar"] .affects')).toHaveText('.band affects 2 elements');
  await typeInto(page, BG, '#ff0000');
  await expect.poll(async () => JSON.stringify((await classesNow(page))[0]?.styles)).toContain('"background-color":"#ff0000"');
  // the Element target: no reach line, the background named as the class's
  const elementChip = control(page, CHIP, { args: { target: 'element' } });
  await elementChip.click();
  await expect(elementChip).toHaveClass(/is-current/);
  await expect(page.locator('[data-region="inspector-selector-bar"] .affects')).toHaveCount(0);
  const origin = page.locator(`.field-origin[data-origin="class"][data-field="${BG}"]`);
  await expect(origin).toHaveText('From .band');
  // a value of Plans' own: no longer the class's
  await typeInto(page, BG, '#0000ff');
  await expect(origin).toHaveCount(0);
  // back to the class, then a new selection: the Element target again
  await bandChip.click();
  await expect(bandChip).toHaveClass(/is-current/);
  await control(page, ROW, { args: { target: 'n-hero' } }).click();
  await expect(control(page, CHIP, { args: { target: 'element' } })).toHaveClass(/is-current/);
  // the Styles view: band, on two elements
  await runDoor(page, STYLES);
  await expect(page.locator('[data-region="styles"] .style-classes__row')).toHaveText(['.band2 elements']);
});

// Problems in Pager 3: the page drawn anew (after a reload) still lets the element's own value override its class.
test('after a reload an element value still overrides its class on the canvas', runs(OPEN, ROW, SAVE, APPLY, CHIP, BG), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await control(page, ROW, { args: { target: 'n-hero' } }).click();
  await control(page, SAVE).click();
  await page.keyboard.type('band');
  await page.keyboard.press('Enter');
  await control(page, ROW, { args: { target: 'n-plans' } }).click();
  await control(page, APPLY).click();
  await control(page, APPLY, { args: { className: 'band' } }).click();
  await control(page, CHIP, { args: { target: 'class', className: 'band' } }).click();
  await typeInto(page, BG, '#ff0000');
  await control(page, CHIP, { args: { target: 'element' } }).click();
  await typeInto(page, BG, '#0000ff');
  const drawn = (id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(() => drawn('n-plans')).toBe('rgb(0, 0, 255)');
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await expect.poll(() => drawn('n-hero')).toBe('rgb(255, 0, 0)');
  await expect.poll(() => drawn('n-plans')).toBe('rgb(0, 0, 255)');
});
