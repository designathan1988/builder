// autosave-restore beyond its scenarios (spec/behavior/autosave-restore.md, Problems in Pager 1): a change survives
// a reload made at once, even while IndexedDB is slow to take the write. The test keeps IndexedDB's store busy (a
// read-write transaction it holds open), deletes an element through its door and reloads at once: the app's own
// IndexedDB write is still waiting when the page unloads, so only a write finished before the unload (the journal)
// can keep the change. The document is read through the read-only test port after the reload.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const DELETE = 'element.delete#key-delete-in-canvas';

const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: { children: { id: string; children: { id: string }[] }[] } }[] }; selection: () => string[] }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const hero = p.document().pages[0]?.tree.children.find((c) => c.id === 'n-hero');
    return { hero: hero?.children.map((c) => c.id) ?? null, selection: p.selection() };
  });

// the screen point at the centre of a node's element
function centre(page: Page, id: string) {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
}

test('a change survives a reload made at once, while IndexedDB is still busy', runs('project.open#menu-file', SELECT, DELETE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-intro"]')).toHaveCount(1);
  const at = await centre(page, 'n-intro');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => read(page)).toEqual({ hero: ['n-title', 'n-intro', 'n-actions'], selection: ['n-intro'] });
  // IndexedDB kept busy: a read-write transaction on the app's store, held open by a request after each answer
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('work');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('projects', 'readwrite').objectStore('projects');
          const again = () => {
            store.get('current').onsuccess = again;
          };
          again();
          resolve();
        };
      }),
  );
  await page.keyboard.press('Delete');
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  expect(await read(page)).toEqual({ hero: ['n-title', 'n-actions'], selection: ['n-actions'] });
});
