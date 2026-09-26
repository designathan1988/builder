// The panels where the doors of future features wait: a door whose feature is not registered as built is not usable
// (the door rule), so View › Timeline, View › Checks and Help › Keyboard shortcuts say "not available yet"; the Styles
// view, whose feature is built, opens with its New variable usable.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runDoor, runs, runsUnavailable } from './door.ts';

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

// The door rule (the user's order of 2026-09-26, item 3): View › Timeline's feature (timeline-animations) is not
// registered as built, so the item is not usable, says why, and a click on it opens nothing: the dock keeps its tabs
// and stays folded. The 18 doors of dock-timeline wait behind it; the census fails any of them drawn usable.
test('View › Timeline waits for its feature: not available yet, and a click opens nothing', runsUnavailable('workspace.setPanelOpen#menu-view-timeline'), async ({ page }) => {
  const tabs = () => page.locator('[data-region="tab-strip"] [role="tab"]').evaluateAll((els) => els.map((el) => el.textContent));
  const canvas = await page.locator('.centre').boundingBox();
  expect(await tabs()).toEqual(['Timeline', 'Checks']);
  expect(placedIn('dock-timeline').length).toBe(18);
  await openMenu(page, 'view');
  const door = page.locator('[data-door="workspace.setPanelOpen#menu-view-timeline"]');
  await expect(door).toHaveAttribute('aria-disabled', 'true');
  await expect(door).toHaveAttribute('title', /not available yet/);
  await door.click({ force: true });
  expect(await tabs()).toEqual(['Timeline', 'Checks']);
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  expect((await page.locator('.centre').boundingBox())?.height).toBe(canvas?.height);
});

// css-variables-tokens is built: the Styles view's New variable is usable (it was "not available yet" while its feature
// waited); creating a variable through it is its feature's scenarios' to prove.
for (const ref of ['workspace.setPanelOpen#toolbar-activity-bar-styles', 'workspace.setPanelOpen#menu-view-variables']) {
  test(`${ref} opens the Styles view with New variable, usable`, runs(ref), async ({ page }) => {
    const sidebar = await page.locator('.sidebar').boundingBox();
    await runDoor(page, ref);
    const view = await page.locator('[data-region="styles"]').boundingBox();
    expect(view?.x).toBeCloseTo(sidebar?.x ?? -1, 0);
    await expect(page.locator('[data-region="explorer-layers"]')).toHaveCount(0);
    const drawn = await drawnIn(page, 'styles');
    expect(drawn.map((d) => d.ref)).toEqual(['tokens.create#variables-add']);
    expect(drawn.filter((d) => d.disabled || d.title.includes('not available yet')).map((d) => d.ref)).toEqual([]);
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
