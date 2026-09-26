// Where a Style field's value comes from (spec inspector-provenance-reset, Problems in Pager 6; the audit's A3.10): with
// the Element target, a value from a class is the muted placeholder, the note under the field names the class, and while
// the field holds the focus a second line says typing writes to the element; what is typed lands on the element and the
// class keeps its value; an inherited colour names the ancestor it comes from, in the Inherited colour; at Tablet a
// colour set at Desktop is the placeholder. The document is read through the read-only test port, the value the page
// takes inside the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const SAVE = 'classes.create#inspector-class-save-as';
const CHIP = 'inspector.setStyleTarget#inspector-class-bar-target';
const ALL = 'inspector.setMode#inspector-mode-all';
const MIN_WIDTH = 'style.set#inspector-min-width';
const COLOR = 'style.set#inspector-color';
const TABLET = 'view.setBreakpoint#toolbar-breakpoint-tabs-tablet';
const DESKTOP = 'view.setBreakpoint#toolbar-breakpoint-tabs-desktop';

interface Node {
  readonly id: string;
  readonly styles: Record<string, Record<string, Record<string, unknown>>>;
  readonly children: readonly Node[];
}
type Port = { document: () => { classes?: { name: string; styles: Node['styles'] }[]; pages: { tree: Node }[] } };
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: Port }).__builderTestPort.document());
const find = (node: Node, id: string): Node | null => (node.id === id ? node : node.children.map((c) => find(c, id)).find((n) => n !== null) ?? null);
const stylesOf = async (page: Page, id: string) => {
  const d = await doc(page);
  const tree = d.pages[0]?.tree;
  return tree === undefined ? null : (find(tree, id)?.styles ?? null);
};
const frameValue = (page: Page, id: string, property: string) =>
  page.frameLocator('.frame__page').locator(`[data-node="${id}"]`).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  await runDoor(page, ALL);
}
async function typeInto(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a value from a class is named under the field, typing says it writes to the element, and the class keeps its value', runs(OPEN, ROW, SAVE, CHIP, ALL, MIN_WIDTH), async ({ page }) => {
  await open(page);
  // CardB's styles saved as the class card2, which it then lists; min-width 160px written into the class
  await control(page, ROW, { args: { target: 'n-card-b' } }).click();
  await control(page, SAVE).click();
  await page.keyboard.type('card2');
  await page.keyboard.press('Enter');
  await control(page, CHIP, { args: { target: 'class', className: 'card2' } }).click();
  await typeInto(page, MIN_WIDTH, '160px');
  await expect.poll(async () => JSON.stringify((await doc(page)).classes)).toContain('"min-width":"160px"');
  // the Element target: the field holds nothing of the element's, its muted placeholder is the class's value
  await control(page, CHIP, { args: { target: 'element' } }).click();
  const input = control(page, MIN_WIDTH).locator('input').first();
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', '160px');
  const note = page.locator(`.field-origin[data-field="${MIN_WIDTH}"]`);
  await expect(note).toHaveAttribute('data-origin', 'class');
  await expect(note).toHaveText('From .card2');
  const writes = page.locator(`.field-writes[data-field="${MIN_WIDTH}"]`);
  await expect(writes).toHaveCount(0);
  // the focus in the field: where typing writes
  await input.click();
  await expect(writes).toHaveText('Typing writes to CardB · Desktop');
  await expect(writes).toHaveCSS('color', await tokenColour(page, '--color-origin-here'));
  await page.keyboard.press('Control+A');
  await page.keyboard.type('200px');
  await page.keyboard.press('Enter');
  // written on the element; the class keeps 160px; the page takes the element's
  await expect.poll(async () => (await stylesOf(page, 'n-card-b'))?.desktop?.base?.['min-width']).toBe('200px');
  expect((await doc(page)).classes?.find((c) => c.name === 'card2')?.styles.desktop?.base?.['min-width']).toBe('160px');
  await expect.poll(() => frameValue(page, 'n-card-b', 'min-width')).toBe('200px');
  // a value of the element's own at the base layer: no note, no notice
  await expect(note).toHaveCount(0);
  await expect(writes).toHaveCount(0);
});

test('an inherited colour names the ancestor it comes from, and at Tablet a colour set at Desktop is the placeholder', runs(OPEN, ROW, ALL, COLOR, TABLET, DESKTOP), async ({ page }) => {
  await open(page);
  await control(page, ROW, { args: { target: 'n-plans' } }).click();
  await typeInto(page, COLOR, '#aa0000');
  await expect.poll(async () => (await stylesOf(page, 'n-plans'))?.desktop?.base?.color).toBe('#aa0000');
  // CardBTitle holds no colour; Grid and CardB neither: Plans is the ancestor it inherits from
  await control(page, ROW, { args: { target: 'n-card-b-title' } }).click();
  const input = control(page, COLOR).locator('input').first();
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', 'rgb(170, 0, 0)');
  const note = page.locator(`.field-origin[data-field="${COLOR}"]`);
  await expect(note).toHaveAttribute('data-origin', 'inherited');
  await expect(note).toHaveText('Inherited from Plans');
  await expect(note).toHaveCSS('color', await tokenColour(page, '--color-origin-inherited'));
  // typing writes to the title, not to Plans
  await input.click();
  await expect(page.locator(`.field-writes[data-field="${COLOR}"]`)).toHaveText('Typing writes to CardBTitle · Desktop');
  await page.keyboard.press('Escape');
  // at Tablet, Plans' colour set at Desktop: the placeholder, from Desktop, in the breakpoint colour
  await runDoor(page, TABLET);
  await control(page, ROW, { args: { target: 'n-plans' } }).click();
  const plansInput = control(page, COLOR).locator('input').first();
  await expect(plansInput).toHaveValue('');
  await expect(plansInput).toHaveAttribute('placeholder', '#aa0000');
  await expect(note).toHaveAttribute('data-origin', 'breakpoint');
  await expect(note).toHaveText('From Desktop');
  await expect(note).toHaveCSS('color', await tokenColour(page, '--color-origin-breakpoint'));
  await plansInput.click();
  await expect(page.locator(`.field-writes[data-field="${COLOR}"]`)).toHaveText('Typing writes to Plans · Tablet');
  await page.keyboard.press('Escape');
  await runDoor(page, DESKTOP);
});
