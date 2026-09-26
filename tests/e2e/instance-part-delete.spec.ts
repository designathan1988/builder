// Delete on an element of an instance (spec reusable-components, "An element ... taken out of it, belongs to that
// instance alone"; the audit's A3.11: it did nothing and said nothing): the element leaves that instance, the
// component's definition keeps it, the status bar says what was deleted, and one undo puts it back. The document is
// read through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const ROW_MENU = 'contextMenu.open#layers-row-secondary-click';
const CREATE = 'components.create#context-menu';
const SELECT = 'selection.select#canvas-click-element-or-page';
const DELETE = 'element.delete#key-delete-in-canvas';
const CTRL_Z = 'history.undo#key-ctrl-z-in-global';

interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[]; components?: { name: string; tree: Tree }[] } }>).__builderTestPort;
    const d = p?.document();
    const ids = (n: Tree | undefined): string[] => (n === undefined ? [] : [n.id, ...n.children.flatMap(ids)]);
    const find = (n: Tree, id: string): Tree | undefined => (n.id === id ? n : n.children.map((c) => find(c, id)).find((x) => x !== undefined));
    const tree = d?.pages[0]?.tree;
    const card = tree === undefined ? undefined : find(tree, 'n-card-a');
    return { card: card?.children.map((c) => c.id) ?? null, definition: d?.components?.map((c) => ids(c.tree).length) ?? [] };
  });

async function clickNode(page: Page, id: string): Promise<void> {
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

test('Delete on an element of an instance takes it out of that instance, says so, keeps the definition, and undoes', runs(OPEN, ROW_MENU, CREATE, SELECT, DELETE, CTRL_Z), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-grid"]')).toHaveCount(1);
  // CardA becomes a component: the card is its first instance, its title an element of that instance
  await runDoor(page, ROW_MENU, { args: { target: 'n-card-a' } });
  await runDoor(page, CREATE);
  await expect(page.getByRole('status')).toHaveText('CardA is now a component.');
  const before = await read(page);
  expect(before.card).toEqual(['n-card-a-title']);
  const definitionSize = before.definition[0];
  await clickNode(page, 'n-card-a-title');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await read(page)).card).toEqual([]);
  await expect(page.getByRole('status')).toHaveText('Deleted CardATitle.');
  expect((await read(page)).definition).toEqual([definitionSize]);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await read(page)).card).toEqual(['n-card-a-title']);
});
