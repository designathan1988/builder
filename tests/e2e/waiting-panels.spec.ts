// The panels where the doors of future features wait (the user's correction of decision 2): the Timeline tab draws the
// doors the manifest places in dock-timeline and the Styles view those of styles, each disabled with "not available
// yet", and the doors that open them (View › Timeline, View › Variables, the activity bar's Styles) are enabled. Checks,
// with no check yet, and Keyboard shortcuts stay closed: their doors are disabled with "not available yet".
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { openMenu, runDoor, runs } from './door.ts';

// the doors the manifest places in a region
function placedIn(region: string): string[] {
  const refs: string[] = [];
  for (const file of fs.readdirSync('manifest/commands')) {
    const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: { id: string; placement: { region: string } | string }[] }[] };
    for (const c of commands) for (const d of c.entryPoints) if (typeof d.placement === 'object' && d.placement.region === region) refs.push(`${c.id}#${d.id}`);
  }
  return refs;
}

// every door drawn in a region, with whether it is disabled and why
const drawnIn = (page: Page, region: string) =>
  page.locator(`[data-region="${region}"] [data-door]`).evaluateAll((els) => els.map((el) => ({ ref: el.getAttribute('data-door') ?? '', disabled: el.getAttribute('aria-disabled') === 'true', title: el.getAttribute('title') ?? '' })));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('View › Timeline opens the Timeline tab with the 18 doors of dock-timeline, each not available yet', runs('workspace.setPanelOpen#menu-view-timeline'), async ({ page }) => {
  const tabs = () => page.locator('[data-region="tab-strip"] [role="tab"]').evaluateAll((els) => els.map((el) => el.textContent));
  const canvas = await page.locator('.centre').boundingBox();
  // a fresh profile has Timeline as a tab of the folded dock: View › Timeline shows it (the user's decision), it does
  // not take the tab out
  expect(await tabs()).toEqual(['Timeline', 'Checks']);
  await runDoor(page, 'workspace.setPanelOpen#menu-view-timeline');
  expect(await tabs()).toEqual(['Timeline', 'Checks']);
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-label', 'Timeline');
  expect((await page.locator('.centre').boundingBox())?.height).toBeLessThan((canvas?.height ?? 0) - 50);

  const placed = placedIn('dock-timeline');
  expect(placed.length).toBe(18);
  const drawn = await drawnIn(page, 'dock-timeline');
  expect([...new Set(drawn.map((d) => d.ref))].sort()).toEqual([...placed].sort());
  expect(drawn.filter((d) => !d.disabled || !d.title.includes('not available yet')).map((d) => d.ref)).toEqual([]);

  // with Timeline showing, View › Timeline takes its tab out, and the dock shows the next one
  await runDoor(page, 'workspace.setPanelOpen#menu-view-timeline');
  expect(await tabs()).toEqual(['Checks']);
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-label', 'Checks');
});

for (const ref of ['workspace.setPanelOpen#toolbar-activity-bar-styles', 'workspace.setPanelOpen#menu-view-variables']) {
  test(`${ref} opens the Styles view with New variable, not available yet`, runs(ref), async ({ page }) => {
    const sidebar = await page.locator('.sidebar').boundingBox();
    await runDoor(page, ref);
    const view = await page.locator('[data-region="styles"]').boundingBox();
    expect(view?.x).toBeCloseTo(sidebar?.x ?? -1, 0);
    await expect(page.locator('[data-region="explorer-layers"]')).toHaveCount(0);
    const drawn = await drawnIn(page, 'styles');
    expect(drawn.map((d) => d.ref)).toEqual(['tokens.create#variables-add']);
    expect(drawn.filter((d) => !d.disabled || !d.title.includes('not available yet')).map((d) => d.ref)).toEqual([]);
  });
}

test('View › Checks and Help › Keyboard shortcuts stay not available yet', async ({ page }) => {
  for (const [menu, ref] of [
    ['view', 'workspace.setPanelOpen#menu-view-checks'],
    ['help', 'workspace.setPanelOpen#menu-help-shortcuts'],
  ] as const) {
    await page.keyboard.press('Escape');
    await openMenu(page, menu);
    const door = page.locator(`[data-door="${ref}"]`);
    await expect(door, ref).toHaveAttribute('aria-disabled', 'true');
    await expect(door, ref).toHaveAttribute('title', /not available yet/);
  }
});
