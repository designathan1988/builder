// autosave-crash-recovery beyond its scenario (spec/behavior/autosave-crash-recovery.md), read in the browser's storage:
//  - IndexedDB keeps the last 10 saved versions, each with its time, the newest the current record's;
//  - a session whose last change never reached IndexedDB (its writes refused, as a browser that dies before they run:
//    the storage made to refuse them, not the app's code) comes back from the journal at the next start, the status bar
//    says the work was recovered, and IndexedDB holds it again.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const INSERT_VIEW = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
type Port = { document: () => unknown };
const documentNow = (page: Page) => page.evaluate(() => JSON.stringify((window as unknown as { __builderTestPort: Port }).__builderTestPort.document()));

// what IndexedDB holds: the current record's revision and every version's revision and time
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ current: number | null; versions: { revision: number; time: number }[]; document: string }>((resolve, reject) => {
        const open = indexedDB.open('work');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['projects', 'versions']);
          const current = tx.objectStore('projects').get('current');
          const versions = tx.objectStore('versions').getAll();
          tx.oncomplete = () => {
            const record = current.result as { revision: number; document: unknown } | undefined;
            resolve({
              current: record?.revision ?? null,
              versions: (versions.result as { revision: number; time: number }[]).map((v) => ({ revision: v.revision, time: v.time })),
              document: JSON.stringify(record?.document ?? null),
            });
          };
        };
      }),
  );

test('IndexedDB keeps the last 10 versions, each with its time', runs(INSERT_VIEW, TILE), async ({ page }) => {
  await openEditor(page);
  await runDoor(page, INSERT_VIEW);
  const save = page.locator('[data-save-state]');
  for (let i = 0; i < 12; i += 1) {
    await runDoor(page, TILE, { args: { entry: 'section' } });
    await expect(save).toHaveAttribute('data-save-state', 'saved');
  }
  const held = await stored(page);
  expect(held.versions).toHaveLength(10);
  const revisions = held.versions.map((v) => v.revision).sort((a, b) => a - b);
  expect(revisions.at(-1)).toBe(held.current);
  expect(revisions[0]).toBe((held.current ?? 0) - 9);
  for (const v of held.versions) expect(v.time).toBeGreaterThan(Date.parse('2020-01-01'));
});

test('a change that never reached IndexedDB comes back from the journal, with a notice', runs(INSERT_VIEW, TILE), async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (window.sessionStorage.getItem('refuse-writes') === 'yes') throw new DOMException('The browser stopped.', 'AbortError');
      return put.apply(this, args);
    };
  });
  await openEditor(page);
  await runDoor(page, INSERT_VIEW);
  await runDoor(page, TILE, { args: { entry: 'section' } });
  const save = page.locator('[data-save-state]');
  await expect(save).toHaveAttribute('data-save-state', 'saved');
  const before = await stored(page);
  // the next change never reaches IndexedDB
  await page.evaluate(() => window.sessionStorage.setItem('refuse-writes', 'yes'));
  await runDoor(page, TILE, { args: { entry: 'section' } });
  await expect(save).toHaveAttribute('data-save-state', 'notSaved');
  expect((await stored(page)).current).toBe(before.current);
  const edited = await documentNow(page);
  expect(edited).not.toBe(before.document);
  // the next start, with a storage that works
  await page.evaluate(() => window.sessionStorage.setItem('refuse-writes', 'no'));
  page.on('dialog', (d) => void d.accept());
  await page.reload();
  await page.locator('.workbench').waitFor();
  await expect(page.getByRole('status')).toHaveText('Your work was recovered from the last session.');
  expect(await documentNow(page)).toBe(edited);
  await expect(save).toHaveAttribute('data-save-state', 'saved');
  const after = await stored(page);
  expect(after.document).toBe(edited);
  expect(after.current).toBeGreaterThan(before.current ?? 0);
});
