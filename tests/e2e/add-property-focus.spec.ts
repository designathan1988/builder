// Add a property and the text shadow's CSS field (specs inspector-add-property, Problems in Pager 3, and shadow-editor,
// Problems in Pager 4; the user's real-use audit, item 1.3): on a paragraph in Essentials only, "+" gives its filter
// the focus; typing text-shadow then Enter draws the Text shadow field in the Text section, with the focus; typing a
// shadow there and Enter writes its layers. The document is read through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ESSENTIALS = 'inspector.setMode#inspector-mode-essentials';
const ADD = 'inspector.reveal#inspector-add-property-item';
const SHADOW_CSS = 'style.setShadows#inspector-text-shadow-shadow-css';

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { local: el?.getAttribute('data-local') ?? null, door: el?.closest('[data-door]')?.getAttribute('data-door') ?? null, section: el?.closest('.inspector-section')?.getAttribute('aria-label') ?? null };
  });
const textShadow = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort;
    const doc = p?.document() as { pages: { tree: { children: { id: string; children: { id: string; styles: Record<string, Record<string, Record<string, unknown>>> }[] }[] } }[] };
    return doc.pages[0]?.tree.children.find((c) => c.id === 'n-hero')?.children.find((c) => c.id === 'n-intro')?.styles.desktop?.base?.['text-shadow'];
  });

test('+ gives its filter the focus; text-shadow and Enter draw the Text shadow field focused in Text; typing a shadow writes it', runs(OPEN, ROW, ESSENTIALS, ADD, SHADOW_CSS), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
  await control(page, ROW, { args: { target: 'n-intro' } }).click();
  await runDoor(page, ESSENTIALS);
  await expect(control(page, SHADOW_CSS)).toHaveCount(0);

  await page.locator(`.add-property > [data-door="${ADD}"]`).click();
  await expect.poll(() => focused(page)).toEqual({ local: 'add-property-filter', door: null, section: null });
  await page.keyboard.type('text-shadow');
  await page.keyboard.press('Enter');
  await expect.poll(() => focused(page)).toEqual({ local: null, door: SHADOW_CSS, section: 'Text' });

  await page.keyboard.type('0 1px 2px #000');
  await page.keyboard.press('Enter');
  await expect.poll(() => textShadow(page)).toEqual([{ color: '#000', offsetX: '0px', offsetY: '1px', blur: '2px', hidden: false }]);
  await expect(control(page, SHADOW_CSS).locator('input')).toHaveValue('#000 0px 1px 2px');
});
