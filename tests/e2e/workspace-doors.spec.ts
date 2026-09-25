// Every door of the built workspace and preferences commands that the shell draws enabled, run through that door with
// the real mouse and keyboard (door.ts). Each test asserts an end artifact, the geometry of the window's regions, a
// computed style or the stored preferences after an immediate reload, so it fails when the door's command does
// nothing or does something else.
import { expect, test, type Page } from '@playwright/test';
import { runDoor, runs } from './door.ts';

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not laid out`);
  return found;
};
const region = (page: Page, id: string) => box(page, `[data-region="${id}"]`);
const storedPreferences = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('preferences') ?? 'null') as unknown);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

for (const ref of ['workspace.setPanelOpen#menu-view-elements', 'workspace.setPanelOpen#toolbar-activity-bar-insert']) {
  test(`${ref} puts Insert in the sidebar, and a second time gives the sidebar's column to the canvas`, runs(ref), async ({ page }) => {
    const start = await box(page, '.workbench');
    const sidebar = await box(page, '.sidebar');
    await runDoor(page, ref);
    const insert = await region(page, 'insert');
    expect(insert.x).toBeCloseTo(sidebar.x, 0);
    expect(insert.width).toBeGreaterThan(sidebar.width / 2);
    await expect(page.locator('[data-region="explorer-layers"]')).toHaveCount(0);

    await runDoor(page, ref);
    await expect(page.locator('.sidebar')).toHaveCount(0);
    const wider = await box(page, '.workbench');
    expect(wider.x).toBeCloseTo(sidebar.x, 0);
    expect(wider.width).toBeCloseTo(start.width + sidebar.width, 0);
  });
}

for (const ref of ['workspace.setPanelOpen#menu-view-explorer', 'workspace.setPanelOpen#toolbar-activity-bar-explorer']) {
  test(`${ref} gives the Explorer's column to the canvas, and a second time puts the Explorer back`, runs(ref), async ({ page }) => {
    const start = await box(page, '.workbench');
    const sidebar = await box(page, '.sidebar');
    const layers = await region(page, 'explorer-layers');
    await runDoor(page, ref);
    await expect(page.locator('.sidebar')).toHaveCount(0);
    const wider = await box(page, '.workbench');
    expect(wider.x).toBeCloseTo(sidebar.x, 0);
    expect(wider.width).toBeCloseTo(start.width + sidebar.width, 0);

    await runDoor(page, ref);
    expect(await box(page, '.workbench')).toEqual(start);
    expect(await region(page, 'explorer-layers')).toEqual(layers);
  });
}

for (const ref of ['workspace.setPanelOpen#menu-view-layers', 'workspace.setPanelOpen#toolbar-layers-header-toggle']) {
  test(`${ref} folds the Layers section to its title, and a second time unfolds it`, runs(ref), async ({ page }) => {
    const open = await region(page, 'explorer-layers');
    const tree = await region(page, 'layers-row');
    await runDoor(page, ref);
    await expect(page.locator('[data-region="layers-row"]')).toHaveCount(0);
    const folded = await region(page, 'explorer-layers');
    expect(folded.height).toBeCloseTo(open.height - tree.height, 0);

    await runDoor(page, ref);
    expect(await region(page, 'explorer-layers')).toEqual(open);
  });
}

test('View › Inspector gives the inspector column to the canvas, and a second time takes it back', runs('workspace.setPanelOpen#menu-view-inspector'), async ({ page }) => {
  const start = await box(page, '.workbench');
  const inspector = await box(page, '.inspector');
  await runDoor(page, 'workspace.setPanelOpen#menu-view-inspector');
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect((await box(page, '.workbench')).width).toBeCloseTo(start.width + inspector.width, 0);

  await runDoor(page, 'workspace.setPanelOpen#menu-view-inspector');
  expect(await box(page, '.workbench')).toEqual(start);
  expect(await box(page, '.inspector')).toEqual(inspector);
});

// the right edge of the controls the canvas toolbar draws from its left (the zoom menu keeps to the right end)
const toolbarEnd = (page: Page) =>
  page
    .locator('[data-region="canvas-toolbar"]')
    .evaluate((el) => Math.max(...[...el.querySelectorAll('button')].filter((b) => b.closest('.canvas-toolbar__zoom') === null).map((b) => b.getBoundingClientRect().right)));

for (const ref of ['workspace.setPanelOpen#menu-view-canvas-tools', 'workspace.setPanelOpen#toolbar-canvas-toolbar-canvas-tools']) {
  test(`${ref} takes the canvas tools out of the canvas toolbar, and a second time puts them back`, runs(ref), async ({ page }) => {
    const open = await toolbarEnd(page);
    await runDoor(page, ref);
    const closed = await toolbarEnd(page);
    expect(closed).toBeLessThan(open - 20);

    await runDoor(page, ref);
    expect(await toolbarEnd(page)).toBe(open);
  });
}

test('the dock strip closes the active tab, and closing the last one leaves an empty strip', runs('workspace.setPanelOpen#workbench-tab-close'), async ({ page }) => {
  const two = await region(page, 'tab-strip');
  await runDoor(page, 'workspace.setPanelOpen#workbench-tab-close');
  const one = await region(page, 'tab-strip');
  expect(one.width).toBeLessThan(two.width - 20);
  expect(one.width).toBeGreaterThan(20);

  await runDoor(page, 'workspace.setPanelOpen#workbench-tab-close');
  expect((await region(page, 'tab-strip')).width).toBeLessThan(one.width - 20);
  await expect(page.locator('[data-door="workspace.setPanelOpen#workbench-tab-close"]')).toHaveCount(0);
});

test('the dock strip shows the workbench under the canvas and hides it again', runs('workspace.setWorkbenchState#toolbar-workbench-strip-toggle'), async ({ page }) => {
  const canvas = await box(page, '.centre');
  const strip = await region(page, 'dock-strip');
  await runDoor(page, 'workspace.setWorkbenchState#toolbar-workbench-strip-toggle');
  const shorter = await box(page, '.centre');
  expect(shorter.height).toBeLessThan(canvas.height - 50);
  expect((await box(page, '.dock')).y).toBeGreaterThanOrEqual(shorter.y + shorter.height - 1);

  await runDoor(page, 'workspace.setWorkbenchState#toolbar-workbench-strip-toggle');
  expect(await box(page, '.centre')).toEqual(canvas);
  expect(await region(page, 'dock-strip')).toEqual(strip);
});

test('the dock strip maximises the workbench over the canvas, and a second time restores it under the canvas', runs('workspace.setWorkbenchState#toolbar-workbench-strip-maximize'), async ({ page }) => {
  const canvas = await box(page, '.centre');
  await runDoor(page, 'workspace.setWorkbenchState#toolbar-workbench-strip-maximize');
  const dock = await box(page, '.dock');
  expect(dock.y).toBeLessThanOrEqual(canvas.y + 1);
  expect(dock.height).toBeGreaterThan(canvas.height - 1);

  await runDoor(page, 'workspace.setWorkbenchState#toolbar-workbench-strip-maximize');
  const restored = await box(page, '.centre');
  expect(restored.y).toBeCloseTo(canvas.y, 0);
  expect(restored.height).toBeLessThan(canvas.height - 50);
  expect((await box(page, '.dock')).y).toBeGreaterThanOrEqual(restored.y + restored.height - 1);
});

test('View › Toggle sidebar gives the sidebar column to the canvas, and a second time takes it back', runs('workspace.toggleLeftDock#menu-view'), async ({ page }) => {
  const start = await box(page, '.workbench');
  const sidebar = await box(page, '.sidebar');
  await runDoor(page, 'workspace.toggleLeftDock#menu-view');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  expect((await box(page, '.workbench')).width).toBeCloseTo(start.width + sidebar.width, 0);

  await runDoor(page, 'workspace.toggleLeftDock#menu-view');
  expect(await box(page, '.workbench')).toEqual(start);
});

test('View › Collapse docks gives every column to the canvas, and a second time puts back what was open', runs('workspace.collapseDocks#menu-view'), async ({ page }) => {
  const start = await box(page, '.workbench');
  const sidebar = await box(page, '.sidebar');
  const inspector = await box(page, '.inspector');
  await runDoor(page, 'workspace.collapseDocks#menu-view');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  expect((await box(page, '.workbench')).width).toBeCloseTo(start.width + sidebar.width + inspector.width, 0);

  await runDoor(page, 'workspace.collapseDocks#menu-view');
  expect(await box(page, '.workbench')).toEqual(start);
});

test('Language › English brings the editor back from Portuguese and keeps it after reload', runs('preferences.setLanguage#menu-language-pt-br', 'preferences.setLanguage#menu-language-en'), async ({ page }) => {
  const view = page.locator('.menu-button[data-menu="view"]');
  await expect(view).toHaveText('View');
  await runDoor(page, 'preferences.setLanguage#menu-language-pt-br');
  await expect(view).toHaveText('Exibir');
  await runDoor(page, 'preferences.setLanguage#menu-language-en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(view).toHaveText('View');

  await page.reload();
  expect(await storedPreferences(page)).toEqual({ locale: 'en', theme: 'dark' });
  await expect(view).toHaveText('View');
});

test('View › Theme › Dark brings the dark theme back from Light and keeps it after reload', runs('preferences.setTheme#menu-theme-light', 'preferences.setTheme#menu-theme-dark'), async ({ page }) => {
  const background = () => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  const dark = await background();
  await runDoor(page, 'preferences.setTheme#menu-theme-light');
  expect(await background()).not.toBe(dark);
  await runDoor(page, 'preferences.setTheme#menu-theme-dark');
  expect(await background()).toBe(dark);

  await page.reload();
  expect(await storedPreferences(page)).toEqual({ locale: 'en', theme: 'dark' });
  expect(await background()).toBe(dark);
});
