// unsaved-work-guard beyond its scenario (spec/behavior/unsaved-work-guard.md): while IndexedDB refuses the writes
// (the browser's storage made to refuse them, as a full quota does: the environment, not the app's code), the status
// bar reads Not saved with the browser's reason, and leaving the tab asks the browser's leave-page confirmation; once
// the storage takes writes again, autosave writes the work on its own (Problems in Pager 3), reads Saved, and leaving
// asks nothing.
import { expect, test } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const INSERT_VIEW = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';

test('a refused write reads Not saved with its reason, asks before leaving, and is written again on its own', runs(INSERT_VIEW, TILE), async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { refuseWrites: boolean };
    w.refuseWrites = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (w.refuseWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await openEditor(page);
  await page.evaluate(() => {
    (window as unknown as { refuseWrites: boolean }).refuseWrites = true;
  });
  await runDoor(page, INSERT_VIEW);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  const save = page.locator('[data-save-state]');
  await expect(save).toHaveAttribute('data-save-state', 'notSaved');
  await expect(save).toHaveText('Not saved: The quota has been exceeded.');

  // leaving asks the browser's confirmation; staying keeps the page
  let asked: string | null = null;
  page.once('dialog', (d) => {
    asked = d.type();
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked, 'leaving asks the browser’s leave-page confirmation').toBe('beforeunload');
  expect(page.isClosed()).toBe(false);

  // the storage takes writes again: the retry writes the work, Saved, and leaving asks nothing
  await page.evaluate(() => {
    (window as unknown as { refuseWrites: boolean }).refuseWrites = false;
  });
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
  let askedAgain = false;
  page.on('dialog', (d) => {
    askedAgain = true;
    void d.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(askedAgain).toBe(false);
});
