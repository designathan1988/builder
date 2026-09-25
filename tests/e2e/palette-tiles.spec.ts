// The Insert tiles follow the feature of their palette entry (elements.json palette[].entries[].feature): the tiles
// of palette-click-insert (Container, Section, Heading, Paragraph) insert; a tile whose entry a later feature brings
// is drawn disabled with "not available yet", and neither a click nor Enter or Space on it inserts anything.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { isFeatureBuilt } from '../../src/app/features.ts';
import type { FeatureId } from '../../src/generated/ids.ts';
import { control, runDoor, runs } from './door.ts';

const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const ENTER = 'element.insert#key-enter-in-palette';
const SPACE = 'element.insert#key-space-in-palette';
interface Entry {
  readonly id: string;
  readonly feature: string;
}
const ENTRIES = (JSON.parse(fs.readFileSync('manifest/elements.json', 'utf8')) as { palette: { entries: Entry[] }[] }).palette.flatMap((g) => g.entries);
const OWN = ENTRIES.filter((e) => e.feature === 'palette-click-insert').map((e) => e.id);
// an entry of a feature that is not built: Header (elements-structure)
const LATER = ENTRIES.find((e) => e.id === 'header');

const documentOf = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; history: () => unknown }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), history: p.history() };
  });

// the keyboard focus on a tile, with Tab as a person moves it
async function tabTo(page: Page, entry: string) {
  const tile = control(page, TILE, { args: { entry } });
  const focused = () => tile.evaluate((el) => el === document.activeElement);
  for (let i = 0; i < 200 && !(await focused()); i += 1) await page.keyboard.press('Tab');
  expect(await focused(), `Tab reaches the tile of ${entry}`).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('the tiles of palette-click-insert insert; a tile of a later feature is not available yet and inserts nothing', runs(INSERT_PANEL, TILE, ENTER, SPACE), async ({ page }) => {
  expect(OWN.sort()).toEqual(['container', 'heading', 'paragraph', 'section']);
  expect(LATER?.feature).toBe('elements-structure');
  await runDoor(page, INSERT_PANEL);
  for (const entry of OWN) await expect(control(page, TILE, { args: { entry } }), entry).not.toHaveAttribute('aria-disabled', 'true');

  const header = control(page, TILE, { args: { entry: 'header' } });
  await expect(header).toHaveAttribute('aria-disabled', 'true');
  await expect(header).toHaveAttribute('title', /not available yet/);
  const before = await documentOf(page);
  // a real click on it (Playwright would wait for an aria-disabled control to be enabled)
  await header.click({ force: true });
  await tabTo(page, 'header');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect(await documentOf(page)).toEqual(before);

  // Enter and Space on an available tile insert its entry, once each
  await tabTo(page, 'paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const after = (await documentOf(page)) as { document: { pages: { tree: { children: { name: string; type: string }[] } }[] }; history: unknown };
  expect(after.document.pages[0]?.tree.children.map((c) => `${c.type} ${c.name}`)).toEqual(['paragraph Paragraph', 'paragraph Paragraph 2']);
  expect(after.history).toEqual({ undoSteps: 2, redoSteps: 0 });
});

// The feature table (src/app/features.ts) decides every tile: a tile is enabled exactly when its entry's feature is
// registered as built, so a template of a feature still to come (Hero, templates-sections) is not available yet and
// a click on it inserts nothing, never a bare section.
test('every tile is enabled exactly when its entry\'s feature is registered as built; the Hero template inserts nothing', runs(INSERT_PANEL, TILE), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  const drawn = await page.locator(`[data-door="${TILE}"]`).evaluateAll((els) => els.map((el) => [JSON.parse(el.getAttribute('data-args') ?? '{}').entry as string, el.getAttribute('aria-disabled') !== 'true'] as const));
  expect(drawn.map(([entry]) => entry).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
  const expected = ENTRIES.map((e) => [e.id, isFeatureBuilt(e.feature as FeatureId)] as const);
  expect(new Map(drawn)).toEqual(new Map(expected));
  const hero = ENTRIES.find((e) => e.id === 'template-hero');
  expect(hero?.feature).toBe('templates-sections');
  const tile = control(page, TILE, { args: { entry: 'template-hero' } });
  await expect(tile).toHaveAttribute('aria-disabled', 'true');
  await expect(tile).toHaveAttribute('title', /not available yet/);
  const before = await documentOf(page);
  await tile.click({ force: true });
  expect(await documentOf(page)).toEqual(before);
});
