// One rule for every numeric field (spec inspector-number-fields, Problems in Pager 4; the audit's A3.32): arrow presses
// in a row on a field are one undo step; a font-relative unit steps by a tenth; a bare number takes the field's own
// default unit, never the unit held before (px for a length; a filter's or a transform's function's unit); ↑ on a value
// that holds no number says so and writes nothing. The document and the history are read through the read-only test
// port; the typing and the keys go through the fields.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ALL = 'inspector.setMode#inspector-mode-all';
const WIDTH = 'style.set#inspector-width';
const FONT_SIZE = 'style.set#inspector-font-size';
const BRIGHTNESS = 'style.setFilter#inspector-filter-filter-brightness';
const SKEW_X = 'style.setTransform#inspector-transform-transform-skew-x';
const STEP_UP = 'field.step#key-arrow-up-in-number-field';
const UNDO = 'history.undo#toolbar-top-bar';

interface Node {
  readonly id: string;
  readonly styles: Record<string, Record<string, Record<string, string>> | undefined>;
  readonly children: readonly Node[];
}
const find = (n: Node, id: string): Node | null => (n.id === id ? n : n.children.map((c) => find(c, id)).find((x) => x !== null) ?? null);
async function grid(page: Page): Promise<{ readonly styles: Record<string, string>; readonly undoSteps: number }> {
  const read = (await page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; history: () => { undoSteps: number } }>).__builderTestPort;
    return { doc: p?.document(), undoSteps: p?.history().undoSteps ?? -1 };
  })) as { doc: { pages: { tree: Node }[] }; undoSteps: number };
  const tree = read.doc.pages[0]?.tree;
  return { styles: (tree ? find(tree, 'n-grid')?.styles.desktop?.base : undefined) ?? {}, undoSteps: read.undoSteps };
}
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
  await runDoor(page, ALL);
});

test('four presses of ArrowUp in a row are one undo step', runs(OPEN, ROW, ALL, WIDTH, STEP_UP, UNDO), async ({ page }) => {
  await type(page, WIDTH, '240px');
  await expect.poll(async () => (await grid(page)).styles.width).toBe('240px');
  const steps = (await grid(page)).undoSteps;
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await grid(page)).styles.width).toBe('244px');
  expect((await grid(page)).undoSteps).toBe(steps + 1);
  await runDoor(page, UNDO);
  await expect.poll(async () => (await grid(page)).styles.width).toBe('240px');
});

test('a font-relative unit steps by a tenth, and a bare number takes px, never the unit held', runs(OPEN, ROW, ALL, FONT_SIZE, STEP_UP), async ({ page }) => {
  await type(page, FONT_SIZE, '2rem');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await grid(page)).styles['font-size']).toBe('2.1rem');
  await type(page, FONT_SIZE, '20');
  await expect.poll(async () => (await grid(page)).styles['font-size']).toBe('20px');
});

test('a bare number in a filter or a transform function takes its unit: Brightness 50 is 50 %, Skew X 10 is 10deg', runs(OPEN, ROW, ALL, BRIGHTNESS, SKEW_X), async ({ page }) => {
  await type(page, BRIGHTNESS, '50');
  await expect.poll(async () => (await grid(page)).styles.filter).toBe('brightness(50%)');
  await type(page, SKEW_X, '10');
  await expect.poll(async () => (await grid(page)).styles.transform).toBe('skewX(10deg)');
});

test('ArrowUp on calc() says there is no number to step and writes nothing', runs(OPEN, ROW, ALL, WIDTH, STEP_UP), async ({ page }) => {
  await type(page, WIDTH, 'calc(100% - 20px)');
  await expect.poll(async () => (await grid(page)).styles.width).toBe('calc(100% - 20px)');
  const steps = (await grid(page)).undoSteps;
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('status')).toHaveText('"calc(100% - 20px)" in Width holds no number to step.');
  expect(await grid(page)).toEqual({ styles: expect.objectContaining({ width: 'calc(100% - 20px)' }) as unknown, undoSteps: steps });
});
