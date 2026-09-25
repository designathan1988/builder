// nest-into-previous and promote-out beyond their scenarios (spec/behavior/nest-into-previous.md,
// promote-out.md): Arrange › Make child of previous layer and Arrange › Move out of parent, doors of the commands a
// user can reach once they are built, run the same commands as their keys and the context menu (nest Problems 2,
// promote Problems 1); Make child of previous layer is disabled, with its reason, when the element before has nothing
// to hold it (nest Problems 1), and pressing it changes nothing. The document, the selection and the history are read
// through the read-only test port.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SELECT = 'selection.select#canvas-click-element-or-page';
const NEST = 'element.nestIntoPrevious#menu-arrange';
const PROMOTE = 'element.promote#menu-arrange';

interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
// the ids of a node's children, the selection and the undo steps, through the read-only test port
const read = (page: Page, parent: string) =>
  page.evaluate((id) => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const find = (t: Tree): Tree | null => (t.id === id ? t : t.children.map(find).find((f) => f !== null) ?? null);
    const tree = p.document().pages[0]?.tree;
    return { children: tree ? (find(tree)?.children.map((c) => c.id) ?? null) : null, selection: p.selection(), undoSteps: p.history().undoSteps };
  }, parent);

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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-b-title"]')).toHaveCount(1);
});

test('Arrange › Move out of parent moves the Monthly title after its card, and Arrange › Make child of previous layer puts it back in', runs('project.open#menu-file', SELECT, PROMOTE, NEST), async ({ page }) => {
  await clickNode(page, 'n-card-a-title');
  await runDoor(page, PROMOTE);
  await expect.poll(() => read(page, 'n-grid')).toEqual({ children: ['n-card-a', 'n-card-a-title', 'n-card-b', 'n-card-c'], selection: ['n-card-a-title'], undoSteps: 1 });
  await expect(page.getByRole('status')).toHaveText('Moved CardATitle to position 2 of 4 in Grid.');
  await runDoor(page, NEST);
  await expect.poll(() => read(page, 'n-card-a')).toEqual({ children: ['n-card-a-title'], selection: ['n-card-a-title'], undoSteps: 2 });
  await expect(page.getByRole('status')).toHaveText('Moved CardATitle into CardA, position 1 of 1.');
});

test('with nothing before it that can hold it, Make child of previous layer is disabled, says why, and changes nothing', runs('project.open#menu-file', SELECT), async ({ page }) => {
  // Intro: the element before it is the Title, a heading, which holds no element
  await clickNode(page, 'n-intro');
  const before = await read(page, 'n-hero');
  await openMenu(page, 'arrange');
  const item = control(page, NEST);
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await expect(item).toHaveAttribute('title', /There is no previous element that can hold it\./);
  await item.click({ force: true });
  expect(await read(page, 'n-hero')).toEqual(before);
});
