// What a style field shows (spec inspector-provenance-reset, Problems in Pager 4; the user's real-use audit, item 1.1):
// the value the document holds, as written, in the Style tab and the quick panel alike; with none, an empty field whose
// placeholder is the effective value (a border side with no style reads none); and nothing either shows changes with
// the canvas zoom. The document is read through the read-only test port; the fields are read in Chrome.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, openQuickPanel, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const BORDER = 'style.setBorder#inspector-border-border-editor';
const QUICK_BORDER = 'style.setBorder#quick-panel-border';
const ZOOM_200 = 'view.zoomTo#menu-zoom-200';

const field = (page: Page, ref: string) => control(page, ref).locator('input').first();
// every style field the inspector and the quick panel draw, with what it holds and its placeholder
const shownFields = (page: Page) =>
  page.locator('[data-region^="inspector-"] input, [data-region="quick-panel"] input').evaluateAll((els) =>
    els.map((el) => {
      const input = el as HTMLInputElement;
      return `${input.closest('[data-door]')?.getAttribute('data-door') ?? ''} ${input.getAttribute('aria-label') ?? ''} = ${input.value} | ${input.placeholder}`;
    }),
  );
const stored = (page: Page, id: string) =>
  page.evaluate((node) => {
    const p = (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort;
    const doc = p?.document() as { pages: { tree: unknown }[] };
    const find = (n: { id: string; styles: Record<string, Record<string, Record<string, string>>>; children: unknown[] }): typeof n | undefined => (n.id === node ? n : (n.children as (typeof n)[]).map(find).find((x) => x !== undefined));
    return find(doc.pages[0]?.tree as Parameters<typeof find>[0])?.styles.desktop?.base ?? {};
  }, id);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-title' } }).click();
});

test('a heading with no border: the Border fields are empty, their placeholder none, in the Style tab and the quick panel', runs(OPEN, ROW, BORDER, QUICK_BORDER), async ({ page }) => {
  expect(await stored(page, 'n-title')).toEqual({});
  await expect(field(page, BORDER)).toHaveValue('');
  await expect(field(page, BORDER)).toHaveAttribute('placeholder', 'none');
  await openQuickPanel(page);
  await expect(field(page, QUICK_BORDER)).toHaveValue('');
  await expect(field(page, QUICK_BORDER)).toHaveAttribute('placeholder', 'none');
});

test('no value or placeholder a field shows changes with the canvas zoom', runs(OPEN, ROW, ZOOM_200), async ({ page }) => {
  await openQuickPanel(page);
  await expect.poll(async () => (await shownFields(page)).length).toBeGreaterThan(20);
  const atFit = await shownFields(page);
  const zoom = await page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).currentCSSZoom);
  await runDoor(page, ZOOM_200);
  await expect.poll(() => page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).currentCSSZoom)).toBe(2);
  expect(zoom).toBeLessThan(1);
  await openQuickPanel(page);
  await expect.poll(() => shownFields(page)).toEqual(atFit);
});

test('a border written as one value is stored as its longhands and shown as it was written', runs(OPEN, ROW, BORDER, QUICK_BORDER), async ({ page }) => {
  await field(page, BORDER).click();
  await page.keyboard.type('2px solid #00aa00');
  await page.keyboard.press('Enter');
  const held = await stored(page, 'n-title');
  for (const side of ['top', 'right', 'bottom', 'left']) {
    expect(held[`border-${side}-width`], side).toBe('2px');
    expect(held[`border-${side}-style`], side).toBe('solid');
    expect(held[`border-${side}-color`], side).toBe('#00aa00');
  }
  await expect(field(page, BORDER)).toHaveValue('2px solid #00aa00');
  await openQuickPanel(page);
  await expect(field(page, QUICK_BORDER)).toHaveValue('2px solid #00aa00');
});
