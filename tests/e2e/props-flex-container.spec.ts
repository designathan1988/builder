// props-flex-container beyond its scenarios (spec/behavior/props-flex-container.md): the gap is the distance the page
// measures between two neighbouring children; the alignment matrix acts on a flex or grid container only (on a block
// element a click writes nothing); its cells are buttons the keyboard reaches and presses. The document is read through
// the read-only test port, the layout inside the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const DISPLAY = 'style.set#inspector-display';
const GAP = 'style.set#inspector-gap';
const MATRIX = 'style.setAlignment#inspector-alignment-matrix';

interface Node {
  readonly id: string;
  readonly styles: Record<string, Record<string, Record<string, string>> | undefined>;
  readonly children: readonly Node[];
}
const nodeIn = (tree: Node, id: string): Node | null => (tree.id === id ? tree : tree.children.map((c) => nodeIn(c, id)).find((n) => n !== null) ?? null);
const declared = async (page: Page, id: string): Promise<Record<string, string>> => {
  const document = (await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document())) as { pages: { tree: Node }[] };
  const tree = document.pages[0]?.tree;
  return (tree ? nodeIn(tree, id)?.styles.desktop?.base : undefined) ?? {};
};
const box = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`).evaluate((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number });

async function type(page: Page, ref: string, text: string): Promise<void> {
  await control(page, ref).locator('input').click();
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
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-grid' } }).click();
  // at 100 % (Ctrl+0, the zoom door), where the page's lengths resolve to whole px (the user's decision for the style
  // scenarios)
  await page.keyboard.press('Control+0');
});

test('the gap is the distance the page measures between neighbouring children', runs(OPEN, ROW, DISPLAY, GAP), async ({ page }) => {
  await type(page, DISPLAY, 'flex');
  await type(page, GAP, '24px');
  await expect.poll(async () => (await declared(page, 'n-grid'))['column-gap']).toBe('24px');
  const [a, b] = [await box(page, 'n-card-a'), await box(page, 'n-card-b')];
  expect(b.left - a.right).toBe(24);
});

test('on an element that is no flex or grid container a cell writes nothing', runs(OPEN, ROW), async ({ page }) => {
  const before = await declared(page, 'n-grid');
  const cell = control(page, MATRIX, { args: { x: 'end', y: 'end' } });
  await expect(cell).toHaveAttribute('aria-disabled', 'true');
  // a person can press a control drawn disabled: the press reaches it (Playwright would wait for it to be enabled)
  await cell.click({ force: true });
  expect(await declared(page, 'n-grid'), 'nothing written').toEqual(before);
});

test('the cells are buttons the keyboard reaches and presses', runs(OPEN, ROW, DISPLAY, MATRIX), async ({ page }) => {
  await type(page, DISPLAY, 'flex');
  await expect.poll(async () => (await declared(page, 'n-grid')).display).toBe('flex');
  // from the top-left cell, Tab to the next one and press it with Enter: top centre
  await control(page, MATRIX, { args: { x: 'start', y: 'start' } }).focus();
  await page.keyboard.press('Tab');
  await expect(control(page, MATRIX, { args: { x: 'center', y: 'start' } })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => declared(page, 'n-grid')).toMatchObject({ 'justify-content': 'center', 'align-items': 'flex-start' });
});
