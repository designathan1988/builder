// clipboard-copy-paste beyond its scenarios: the Edit menu's Copy and Paste, the doors a user reaches from the menu bar.
// Copy writes the selected element to the system clipboard; Paste reads it back and places a copy with fresh ids and a
// new unique name right after the selected leaf, which becomes the selection, in one undo step. The document, the
// selection and the history are read through the read-only test port; the page through the frame.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const MENU_COPY = 'clipboard.copy#menu-edit';
const MENU_PASTE = 'clipboard.paste#menu-edit';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';

interface Tree {
  readonly id: string;
  readonly name: string;
  readonly text: string | null;
  readonly children: readonly Tree[];
}
// the children of Hero (id, name, text), the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const hero = p.document().pages[0]?.tree.children.find((c) => c.id === 'n-hero');
    return { hero: hero?.children.map((c) => ({ id: c.id, name: c.name, text: c.text })) ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const drawn = (page: Page, id: string) => page.frameLocator('.frame__page').locator(`[data-node="${id}"]`);

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(drawn(page, 'n-intro')).toHaveCount(1);
}

// a click on the canvas at the centre of a node's element (a leaf: the click hits the node itself)
async function clickNode(page: Page, id: string) {
  const at = await page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${node}"]`);
    if (!iframe || !el) throw new Error(`the canvas does not draw ${node}`);
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  }, id);
  await page.mouse.click(at.x, at.y);
}

test.beforeEach(async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await openAurora(page);
});

test('Edit › Copy and Edit › Paste place a copy of the selected leaf right after it, in one undo step', runs(SELECT, MENU_COPY, MENU_PASTE, CTRL_Z), async ({ page }) => {
  await clickNode(page, 'n-intro');
  expect((await read(page)).selection).toEqual(['n-intro']);
  await runDoor(page, MENU_COPY);
  // what Copy wrote is what Paste reads: the system clipboard holds the element
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Fresh coffee, roasted every week.');
  const before = await read(page);
  await runDoor(page, MENU_PASTE);
  await expect.poll(async () => (await read(page)).hero?.map((c) => c.name)).toEqual(['Title', 'Intro', 'Intro 2', 'Actions']);
  const after = await read(page);
  const copy = after.hero?.[2];
  expect(copy?.text).toBe('Fresh coffee, roasted every week.');
  expect(copy?.id).not.toBe('n-intro');
  expect(after.selection).toEqual([copy?.id]);
  expect(after.undoSteps).toBe(before.undoSteps + 1);
  // the canvas draws the copy after the original
  await expect(drawn(page, copy?.id ?? '')).toHaveText('Fresh coffee, roasted every week.');
  // one undo step takes it away
  await runDoor(page, CTRL_Z);
  await expect.poll(async () => (await read(page)).hero?.map((c) => c.name)).toEqual(['Title', 'Intro', 'Actions']);
});
