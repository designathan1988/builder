// autosave-corruption-recovery beyond its scenario (spec/behavior/autosave-corruption-recovery.md): after a start on a
// saved record the reader refuses, the status bar reads Recovery required, and an edit writes nothing: the corrupted
// record stays in storage as it was, closing the dialog included; File › New blank page (another project replacing the
// document) lets autosave write again.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const INSERT_VIEW = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const CLOSE = 'ui.dismiss#dialog-close';
const BLANK = 'project.newBlankPage#menu-file';
const CORRUPT = 'this is not a project';

const currentRecord = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open('work');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('projects').objectStore('projects').get('current');
          request.onsuccess = () => {
            resolve((request.result as { document: unknown } | undefined)?.document);
            open.result.close();
          };
        };
      }),
  );

test('while recovery is required an edit writes nothing, and a new blank page lets autosave write again', runs(INSERT_VIEW, TILE, CLOSE, BLANK), async ({ page }) => {
  await openEditor(page);
  await runDoor(page, INSERT_VIEW);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  const save = page.locator('[data-save-state]');
  await expect(save).toHaveAttribute('data-save-state', 'saved');
  await page.evaluate(
    (corrupt) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('work');
        open.onsuccess = () => {
          const tx = open.result.transaction('projects', 'readwrite');
          tx.objectStore('projects').put({ revision: 1000, format: 1, document: corrupt, selection: [] }, 'current');
          tx.oncomplete = () => {
            open.result.close();
            window.localStorage.removeItem('work-journal');
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    CORRUPT,
  );
  await page.reload();
  await page.locator('.workbench').waitFor();
  await expect(save).toHaveAttribute('data-save-state', 'recoveryRequired');
  await expect(page.locator('[data-region="recovery-dialog"]')).toBeVisible();
  await runDoor(page, CLOSE);
  await expect(page.locator('[data-region="recovery-dialog"]')).toHaveCount(0);
  // an edit: nothing is written
  await runDoor(page, INSERT_VIEW);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  await expect(save).toHaveAttribute('data-save-state', 'recoveryRequired');
  expect(await currentRecord(page)).toBe(CORRUPT);
  // another project replaces the document: autosave writes it
  await runDoor(page, BLANK);
  await page.locator('[data-confirmation="confirm"]').click();
  await expect(save).toHaveAttribute('data-save-state', 'saved');
  expect(await currentRecord(page)).not.toBe(CORRUPT);
});
