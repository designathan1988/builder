// workbench-panel beyond its scenarios (spec/behavior/workbench-panel.md, Problems in Pager 2): View › Developer tools
// gives the dock a Document tab showing the document as it is now, as JSON, read-only, drawn again after every command;
// the choice is a preference, so the tab is there again after a reload, and turning it off takes the tab out. The
// document is read through the read-only test port.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runDoor, runs } from './door.ts';

const DEVELOPER = 'workspace.toggleDeveloperTools#menu-view';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';

const portDocument = (page: Page) => page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document());
const shownJson = async (page: Page): Promise<unknown> => JSON.parse((await page.getByRole('tabpanel').locator('pre').textContent()) ?? 'null');
const tabs = (page: Page) => page.locator('[data-region="tab-strip"] [role="tab"]').evaluateAll((els) => els.map((el) => el.textContent));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('the Document tab shows the live document as JSON, read-only, drawn again after every command', runs(DEVELOPER, INSERT_PANEL, TILE), async ({ page }) => {
  await runDoor(page, DEVELOPER);
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-label', 'Document');
  const before = await portDocument(page);
  expect(await shownJson(page)).toEqual(before);

  // a command that changes the document: the tab shows the new document, not the old one
  await runDoor(page, INSERT_PANEL);
  await control(page, TILE, { args: { entry: 'paragraph' } }).click();
  const after = await portDocument(page);
  expect(after).not.toEqual(before);
  await expect.poll(() => shownJson(page)).toEqual(after);

  // read-only: typing into it changes neither what it shows nor the document
  const pre = page.getByRole('tabpanel').locator('pre');
  await pre.click();
  await page.keyboard.type('x');
  expect(await shownJson(page)).toEqual(after);
  expect(await portDocument(page)).toEqual(after);
  expect(await pre.evaluate((el) => (el as HTMLElement).isContentEditable)).toBe(false);
});

test('Developer tools is kept after a reload with its Document tab; turned off, the tab goes', runs(DEVELOPER), async ({ page }) => {
  expect(await tabs(page)).toEqual(['Timeline', 'Checks']);
  await runDoor(page, DEVELOPER);
  expect(await tabs(page)).toEqual(['Timeline', 'Checks', 'Document']);
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect(await tabs(page)).toEqual(['Timeline', 'Checks', 'Document']);
  await runDoor(page, DEVELOPER);
  expect(await tabs(page)).toEqual(['Timeline', 'Checks']);
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect(await tabs(page)).toEqual(['Timeline', 'Checks']);
});
