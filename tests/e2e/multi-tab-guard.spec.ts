// multi-tab-guard beyond its scenario (spec/behavior/multi-tab-guard.md), with two tabs of the editor on one profile:
// the second tab reads the project, says so, refuses a document command (the status bar saying why) and writes
// nothing; once it takes over, the first tab becomes read-only at once, says another tab took over, and refuses too.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const INSERT_VIEW = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const TAKE_OVER = 'project.takeOverEditing#tab-guard-take-over';
type Port = { document: () => unknown };
const documentNow = (page: Page) => page.evaluate(() => JSON.stringify((window as unknown as { __builderTestPort: Port }).__builderTestPort.document()));
const savedRevision = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('work');
        open.onsuccess = () => {
          const request = open.result.transaction('projects').objectStore('projects').get('current');
          request.onsuccess = () => {
            resolve((request.result as { revision: number } | undefined)?.revision ?? null);
            open.result.close();
          };
        };
      }),
  );

test('a second tab reads, refuses and writes nothing; taking over makes the first tab read-only', runs(INSERT_VIEW, TILE, TAKE_OVER), async ({ page, context }) => {
  await openEditor(page);
  await runDoor(page, INSERT_VIEW);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.locator('[data-region="tab-guard"]')).toHaveCount(0);

  const second = await context.newPage();
  await openEditor(second);
  await expect(second.locator('[data-region="tab-guard"]')).toHaveText(/being edited in another tab/);
  const read = await documentNow(second);
  expect(read).toBe(await documentNow(page));
  const revision = await savedRevision(second);
  // a selection changes in the read-only tab: autosave, which writes a selection change in the editing tab, writes nothing
  const rows = second.locator('[data-door="selection.select#layers-row"]');
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await runDoor(second, INSERT_VIEW);
  await runDoor(second, TILE, { args: { entry: 'section' } });
  await expect(second.getByRole('status')).toHaveText('Read-only: this project is being edited in another tab.');
  expect(await documentNow(second)).toBe(read);
  expect(await savedRevision(second)).toBe(revision);

  // the second tab takes over: it edits; the first becomes read-only and refuses
  await runDoor(second, TAKE_OVER);
  await second.locator('.workbench').waitFor();
  await expect(second.locator('[data-region="tab-guard"]')).toHaveCount(0);
  await expect(page.locator('[data-region="tab-guard"]')).toHaveText(/Another tab took over editing/);
  const before = await documentNow(page);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  await expect(page.getByRole('status')).toHaveText('Read-only: this project is being edited in another tab.');
  expect(await documentNow(page)).toBe(before);
  // the second tab edits and writes
  await runDoor(second, INSERT_VIEW);
  await runDoor(second, TILE, { args: { entry: 'section' } });
  await expect(second.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved');
  expect(await savedRevision(second)).toBeGreaterThan(revision ?? 0);
});
