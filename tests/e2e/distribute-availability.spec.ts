// Distribute's door and its reason (spec align-distribute; the audit's A3.23): Arrange › Distribute is available only
// for three positioned elements or more. With elements that are not positioned it says Distribute's own reason, never
// Align's; with two positioned elements it says it needs three; a forced click on it changes nothing; with three it is
// available. The document is read through the read-only test port; the door's state and reason are its drawn menu item.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW = 'selection.select#layers-row';
const ADD = 'selection.add#layers-row-shift';
const POSITION = 'position.setMode#inspector-position';
const DISTRIBUTE = 'position.distribute#menu-arrange-horizontal';

const documentText = (page: Page) => page.evaluate(() => JSON.stringify((window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document()));
// the Distribute item as the Arrange menu draws it: available, and the words of its title
async function distributeItem(page: Page): Promise<{ readonly available: boolean; readonly title: string }> {
  await openMenu(page, 'arrange');
  const item = page.locator(`[data-door="${DISTRIBUTE}"]`);
  const read = { available: (await item.getAttribute('aria-disabled')) !== 'true', title: (await item.getAttribute('title')) ?? '' };
  await page.keyboard.press('Escape');
  return read;
}
async function select(page: Page, ids: readonly string[]): Promise<void> {
  const [first, ...rest] = ids;
  await control(page, ROW, { args: { target: first } }).click();
  for (const id of rest) await control(page, ROW, { args: { target: id } }).click({ modifiers: ['Shift'] });
}
async function positionAbsolute(page: Page, id: string): Promise<void> {
  await control(page, ROW, { args: { target: id } }).click();
  await control(page, POSITION, { args: { mode: 'absolute' } }).click();
}

test('Distribute waits for three positioned elements, saying its own reason, and a click on it changes nothing', runs(OPEN, ROW, ADD, POSITION), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);

  // three elements that are not positioned: Distribute's own reason
  await select(page, ['n-card-a', 'n-card-b', 'n-card-c']);
  expect(await distributeItem(page)).toEqual({ available: false, title: 'Distribute horizontally — Distribute works on absolutely positioned elements.' });

  // two positioned elements: it needs three, and a forced click changes nothing
  await positionAbsolute(page, 'n-card-a');
  await positionAbsolute(page, 'n-card-b');
  await select(page, ['n-card-a', 'n-card-b']);
  expect(await distributeItem(page)).toEqual({ available: false, title: 'Distribute horizontally — Distribute needs at least three elements.' });
  const before = await documentText(page);
  await openMenu(page, 'arrange');
  await page.locator(`[data-door="${DISTRIBUTE}"]`).click({ force: true });
  await page.keyboard.press('Escape');
  expect(await documentText(page)).toBe(before);

  // three positioned elements: available
  await positionAbsolute(page, 'n-card-c');
  await select(page, ['n-card-a', 'n-card-b', 'n-card-c']);
  expect((await distributeItem(page)).available).toBe(true);
});

// The doors read the layer the editor shows (the audit's A3.23, found in its real use): an element made absolute at
// Phone is positioned there, so Arrange › Align left is available at Phone and runs, and its message counts the one
// element in words.
const PHONE = 'view.setBreakpoint#toolbar-breakpoint-tabs-phone';
const ALIGN_LEFT = 'position.align#menu-arrange-left';
test('at Phone an element made absolute there aligns: the door reads the breakpoint shown, and says "1 element"', runs(OPEN, PHONE, ROW, POSITION, ALIGN_LEFT), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  await runDoor(page, PHONE);
  await positionAbsolute(page, 'n-card-a');
  await openMenu(page, 'arrange');
  await expect(page.locator(`[data-door="${ALIGN_LEFT}"]`)).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator(`[data-door="${ALIGN_LEFT}"]`).click();
  await expect(page.getByRole('status')).toHaveText('Align left: 1 element.');
});
