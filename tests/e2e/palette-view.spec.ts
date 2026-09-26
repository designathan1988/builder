// The Insert panel's view (features palette-density and palette-search-groups) beyond their scenarios: each density lays
// every group's tiles out in its number of columns (List one, Two columns two, Three columns three, Icon grid more,
// labels hidden), Two columns brings the default layout back after another density, a collapsed group draws none of its
// tiles, and both choices are kept after an immediate reload. Measured on the drawn tile grids (the palette-tiles
// component), never on a proxy.
import { expect, test, type Page } from '../support/test.ts';
import { control, runDoor, runs } from './door.ts';

const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const LIST = 'palette.setDensity#elements-density-list';
const TWO = 'palette.setDensity#elements-density-two-columns';
const THREE = 'palette.setDensity#elements-density-three-columns';
const ICONS = 'palette.setDensity#elements-density-icons';
const GROUP = 'palette.toggleGroup#elements-group-header';

// the number of columns of every drawn tile grid, in the panel's order
const columns = (page: Page) =>
  page.locator('[data-region="insert"] [data-region="palette-tiles"]').evaluateAll((grids) => grids.map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length));
// whether the tiles of a group are drawn: its header is followed by its grid
const groupTiles = (page: Page, group: string) => control(page, GROUP, { args: { group } }).locator('xpath=following-sibling::*[@data-region="palette-tiles"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await runDoor(page, INSERT_PANEL);
});

test('each density lays every group out in its columns, Two columns brings the default back, and the choice is kept after a reload', runs(INSERT_PANEL, LIST, TWO, THREE, ICONS), async ({ page }) => {
  // the four density buttons lie side by side inside the panel, none spilling over another or out of it
  const panel = await page.locator('[data-region="insert"]').boundingBox();
  const buttons = await Promise.all([LIST, TWO, THREE, ICONS].map((ref) => control(page, ref).boundingBox()));
  for (const [i, box] of buttons.entries()) {
    if (box === null || panel === null) throw new Error('a density button or the panel is not drawn');
    expect(box.x, `density button ${i + 1} starts inside the panel`).toBeGreaterThanOrEqual(panel.x);
    expect(box.x + box.width, `density button ${i + 1} ends inside the panel`).toBeLessThanOrEqual(panel.x + panel.width);
    const next = buttons[i + 1];
    if (next) expect(box.x + box.width, `density button ${i + 1} ends before the next starts`).toBeLessThanOrEqual((next.x ?? 0) + 0.5);
  }
  // and what each draws fits inside it (no label running over its neighbour)
  for (const ref of [LIST, TWO, THREE, ICONS]) expect(await control(page, ref).evaluate((el) => el.scrollWidth <= el.clientWidth), `${ref} draws inside itself`).toBe(true);
  const groups = (await columns(page)).length;
  expect(groups).toBeGreaterThan(1);
  expect(await columns(page)).toEqual(Array(groups).fill(2));
  await runDoor(page, LIST);
  await expect.poll(() => columns(page)).toEqual(Array(groups).fill(1));
  await runDoor(page, THREE);
  await expect.poll(() => columns(page)).toEqual(Array(groups).fill(3));
  await runDoor(page, ICONS);
  await expect.poll(async () => (await columns(page)).every((n) => n > 3)).toBe(true);
  await expect(page.locator('[data-region="insert"] .tile__label').first()).toBeHidden();
  await runDoor(page, TWO);
  await expect.poll(() => columns(page)).toEqual(Array(groups).fill(2));
  await runDoor(page, THREE);
  await expect.poll(() => columns(page)).toEqual(Array(groups).fill(3));
  // kept after an immediate reload
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  if ((await page.locator('[data-region="insert"]').count()) === 0) await runDoor(page, INSERT_PANEL);
  await expect.poll(() => columns(page)).toEqual(Array(groups).fill(3));
});

test('a collapsed group draws none of its tiles, opens again, and stays collapsed after a reload', runs(INSERT_PANEL, GROUP), async ({ page }) => {
  await expect(groupTiles(page, 'text')).toHaveCount(1);
  await runDoor(page, GROUP, { args: { group: 'text' } });
  await expect(groupTiles(page, 'text')).toHaveCount(0);
  await expect(groupTiles(page, 'structure')).toHaveCount(1);
  await runDoor(page, GROUP, { args: { group: 'text' } });
  await expect(groupTiles(page, 'text')).toHaveCount(1);
  await runDoor(page, GROUP, { args: { group: 'text' } });
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  if ((await page.locator('[data-region="insert"]').count()) === 0) await runDoor(page, INSERT_PANEL);
  await expect(groupTiles(page, 'text')).toHaveCount(0);
  await expect(groupTiles(page, 'structure')).toHaveCount(1);
});
