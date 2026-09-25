// layers-tree beyond its scenarios (spec/behavior/layers-tree.md): the rows follow the document (one per node, in
// document order, indented by depth), the header counts every node whatever is folded (Problems in Pager 3), and a
// selection made on the canvas scrolls its row into view (Problems in Pager 1). The selection is read through the
// read-only test port; what Layers shows is read from its rows and measured against the view that scrolls them.
import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';

interface FixtureNode {
  readonly id: string;
  readonly name: string;
  readonly children: readonly FixtureNode[];
}
const TREE = (JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { pages: { tree: FixtureNode }[] }).pages[0]?.tree;
// every node of the fixture's page in document order, with its depth
const ORDER: { id: string; name: string; depth: number }[] = [];
const walk = (n: FixtureNode, depth: number) => {
  ORDER.push({ id: n.id, name: n.name, depth });
  for (const c of n.children) walk(c, depth + 1);
};
if (TREE) walk(TREE, 0);

const selection = (page: Page) => page.evaluate(() => (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort?.selection());
const row = (page: Page, id: string) => control(page, 'selection.select#layers-row', { args: { target: id } });
const rows = (page: Page) => page.locator('[data-region="explorer-layers"] [role="treeitem"]');

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-note"]')).toHaveCount(1);
}

// the screen centre of a node's element, through the frame's CSS zoom
function screenCentre(page: Page, id: string): Promise<{ x: number; y: number }> {
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

// whether the whole of a row lies inside what the scrolling view shows
async function shownIn(view: Locator, target: Locator): Promise<boolean> {
  const [v, r] = [await view.boundingBox(), await target.boundingBox()];
  if (v === null || r === null) return false;
  return r.y >= v.y - 0.5 && r.y + r.height <= v.y + v.height + 0.5;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test(
  'Layers shows one row per node in document order, indented by depth; the header counts every node, folded or not; a caret folds without selecting',
  runs('project.open#menu-file', 'layers.setExpanded#layers-caret'),
  async ({ page }) => {
    const count = page.locator('[data-count="layers"]');
    await expect(count).toHaveText('1');
    await expect(rows(page)).toHaveCount(1);

    await openAurora(page);
    await expect(count).toHaveText(String(ORDER.length));
    await expect(rows(page).locator('.row__name')).toHaveText(ORDER.map((n) => n.name));
    for (const n of ORDER) await expect(row(page, n.id)).toHaveAttribute('aria-level', String(n.depth + 1));
    // each level is indented further than its parent
    const indent = (id: string) => row(page, id).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(await indent('n-card-a-title')).toBeGreaterThan(await indent('n-card-a'));
    expect(await indent('n-card-a')).toBeGreaterThan(await indent('n-grid'));

    // the caret folds the branch: its rows go, the count stays, nothing is selected
    await runDoor(page, 'layers.setExpanded#layers-caret', { args: { target: 'n-plans' } });
    await expect(row(page, 'n-plans')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'n-grid')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(ORDER.length - 11);
    await expect(count).toHaveText(String(ORDER.length));
    expect(await selection(page)).toEqual([]);

    // the second press unfolds it again
    await runDoor(page, 'layers.setExpanded#layers-caret', { args: { target: 'n-plans' } });
    await expect(row(page, 'n-plans')).toHaveAttribute('aria-expanded', 'true');
    await expect(rows(page)).toHaveCount(ORDER.length);
    expect(await selection(page)).toEqual([]);
  },
);

test('a selection made on the canvas marks its row and scrolls it into view', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page'), async ({ page }) => {
  // a window low enough that the Layers rows overflow the view that scrolls them
  await page.setViewportSize({ width: 1440, height: 420 });
  await openAurora(page);
  const view = page.locator('.sidebar .view');
  const title = row(page, 'n-title');

  // the wheel scrolls the view to its end: the Title row is no longer shown
  const box = await view.boundingBox();
  if (box === null) throw new Error('the Explorer view is not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => shownIn(view, title), { message: 'the Title row is scrolled out of the view' }).toBe(false);

  // a click on the Title on the canvas selects it, marks its row and brings the row back into the view
  const at = await screenCentre(page, 'n-title');
  await page.mouse.click(at.x, at.y);
  expect(await selection(page)).toEqual(['n-title']);
  await expect(title).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => shownIn(view, title), { message: 'the Title row is scrolled into the view' }).toBe(true);
});
