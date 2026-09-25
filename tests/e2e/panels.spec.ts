// A door whose only effect is to open a panel without its content is disabled with "not available yet" (CLAUDE.md;
// the user's decision 2 as the user corrected it): Help › Keyboard shortcuts and View › Checks. The doors of the panels
// that exist (the sidebar's Explorer with Layers, Insert and Styles, the inspector, the dock with its Timeline, the
// canvas tools) stay enabled.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';

const EMPTY = ['checks', 'shortcuts'];
const BUILT = ['explorer', 'elements', 'variables', 'layers', 'inspector', 'workbench', 'timeline', 'canvas-tools'];

interface Door {
  id: string;
  kind: string;
  menu?: string;
  args: Record<string, unknown>;
}
const panelDoors: { ref: string; kind: string; menu: string | null; panel: string }[] = [];
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: Door[] }[] };
  for (const c of commands) {
    if (c.id !== 'workspace.setPanelOpen') continue;
    for (const d of c.entryPoints) {
      if (typeof d.args.panel === 'string' && d.args.open !== 'close' && (d.kind === 'menu' || d.kind === 'toolbar')) panelDoors.push({ ref: `${c.id}#${d.id}`, kind: d.kind, menu: d.menu ?? null, panel: d.args.panel });
    }
  }
}
const MENU_BUTTONS: Record<string, string> = { view: 'View', help: 'Help' };

async function control(page: Page, door: (typeof panelDoors)[number]) {
  if (door.menu !== null) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: MENU_BUTTONS[door.menu] ?? door.menu, exact: true }).click();
  }
  return page.locator(`[data-door="${door.ref}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
});

test('a door that only opens a panel without its content is disabled with "not available yet" and changes nothing', async ({ page }) => {
  const empty = panelDoors.filter((d) => EMPTY.includes(d.panel));
  // Help › Keyboard shortcuts and View › Checks
  expect(empty.map((d) => d.ref).sort()).toEqual(['workspace.setPanelOpen#menu-help-shortcuts', 'workspace.setPanelOpen#menu-view-checks']);
  for (const door of empty) {
    const before = { sidebar: await page.locator('.sidebar').boundingBox(), centre: await page.locator('.centre').boundingBox(), styles: await page.locator('[data-region="styles"]').count() };
    const button = await control(page, door);
    await expect(button, door.ref).toHaveAttribute('aria-disabled', 'true');
    await expect(button, door.ref).toHaveAttribute('title', /not available yet/);
    await button.click({ force: true });
    await page.keyboard.press('Escape');
    expect({ sidebar: await page.locator('.sidebar').boundingBox(), centre: await page.locator('.centre').boundingBox(), styles: await page.locator('[data-region="styles"]').count() }, door.ref).toEqual(before);
  }
});

test('the doors of the panels that exist stay enabled', async ({ page }) => {
  const built = panelDoors.filter((d) => BUILT.includes(d.panel));
  expect(built.length).toBeGreaterThan(8);
  for (const door of built) {
    const button = await control(page, door);
    await expect(button, door.ref).not.toHaveAttribute('aria-disabled', 'true');
  }
});
