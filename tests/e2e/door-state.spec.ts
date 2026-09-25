// A built door that stands for a state says whether it is on, as its door data says it is drawn: a toggle button
// (pressed) by aria-pressed, a menu item (checked radio or checkbox) by its role and aria-checked, both from the
// current state the store holds. A door that is no toggle (a close button, a command item) says nothing.
import { expect, test } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { openMenu, runDoor, runs } from './door.ts';

const door = (ref: string) => `[data-door="${ref}"]`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('the toggle buttons of the panels and the workbench say whether they are on, and a close button says nothing', runs('workspace.setPanelOpen#toolbar-activity-bar-insert', 'workspace.setWorkbenchState#toolbar-workbench-strip-maximize'), async ({ page }) => {
  // a fresh profile: the Explorer and the canvas tools are open, Insert is not, the workbench is folded to its strip
  await expect(page.locator(door('workspace.setPanelOpen#toolbar-activity-bar-explorer'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(door('workspace.setPanelOpen#toolbar-activity-bar-insert'))).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(door('workspace.setPanelOpen#toolbar-canvas-toolbar-canvas-tools'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(door('workspace.setWorkbenchState#toolbar-workbench-strip-toggle'))).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(door('workspace.setWorkbenchState#toolbar-workbench-strip-maximize'))).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(door('workspace.setPanelOpen#workbench-tab-close'))).not.toHaveAttribute('aria-pressed', /.*/);

  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-insert');
  await expect(page.locator(door('workspace.setPanelOpen#toolbar-activity-bar-insert'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(door('workspace.setPanelOpen#toolbar-activity-bar-explorer'))).toHaveAttribute('aria-pressed', 'false');

  await runDoor(page, 'workspace.setWorkbenchState#toolbar-workbench-strip-maximize');
  await expect(page.locator(door('workspace.setWorkbenchState#toolbar-workbench-strip-maximize'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(door('workspace.setWorkbenchState#toolbar-workbench-strip-toggle'))).toHaveAttribute('aria-pressed', 'true');
});

test('the Theme and Language items are one choice of a set and say which is chosen', runs('preferences.setTheme#menu-theme-light'), async ({ page }) => {
  const item = (ref: string) => page.locator(`[role="menuitemradio"]${door(ref)}`);
  await openMenu(page, 'theme');
  await expect(item('preferences.setTheme#menu-theme-dark')).toHaveAttribute('aria-checked', 'true');
  await expect(item('preferences.setTheme#menu-theme-light')).toHaveAttribute('aria-checked', 'false');
  await expect(item('preferences.setTheme#menu-theme-system')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await runDoor(page, 'preferences.setTheme#menu-theme-light');
  await openMenu(page, 'theme');
  await expect(item('preferences.setTheme#menu-theme-light')).toHaveAttribute('aria-checked', 'true');
  await expect(item('preferences.setTheme#menu-theme-dark')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await openMenu(page, 'language');
  await expect(item('preferences.setLanguage#menu-language-en')).toHaveAttribute('aria-checked', 'true');
  await expect(item('preferences.setLanguage#menu-language-pt-br')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  // the zoom levels are choices too, and none is chosen while view.zoomTo is not built
  await openMenu(page, 'zoom');
  await expect(item('view.zoomTo#menu-zoom-100')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator(door('view.zoomFit#menu-zoom'))).toHaveAttribute('role', 'menuitem');
  await page.keyboard.press('Escape');

  // a command item of the same menu bar is no choice
  await openMenu(page, 'view');
  await expect(page.locator(door('workspace.toggleLeftDock#menu-view'))).toHaveAttribute('role', 'menuitem');
  await expect(page.locator(door('workspace.toggleLeftDock#menu-view'))).not.toHaveAttribute('aria-checked', /.*/);
});

// A control that cannot run never looks like one that can (brief "a aplicação completa": no enabled-looking control
// that does nothing): the top bar's main action, Export project (ZIP), wears the accent only while it can run; not
// available yet, it is drawn like every other unavailable control, and a click on it exports nothing.
test('a main action that is not available yet is not drawn in the accent colour, and a click on it does nothing', async ({ page }) => {
  const exportButton = page.locator(door('project.export#toolbar-top-bar-export'));
  await expect(exportButton).toHaveAttribute('aria-disabled', 'true');
  const colours = await exportButton.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-accent)';
    el.parentElement?.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { accent, background: getComputedStyle(el).backgroundColor };
  });
  expect(colours.background).not.toBe(colours.accent);
  // what a click that reached a command would change: a download, the export the test port reads, the status bar,
  // the document and the history
  const state = () =>
    page.evaluate(() => {
      const p = (window as unknown as Record<string, { document: () => unknown; history: () => unknown; export: () => unknown }>).__builderTestPort;
      if (!p) throw new Error('the test port is missing');
      return { document: p.document(), history: p.history(), export: p.export(), status: document.querySelector('[role="status"]')?.textContent ?? null };
    });
  const before = await state();
  expect(before.export).toBeNull();
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await exportButton.click({ force: true });
  await page.waitForTimeout(300);
  expect(downloads).toEqual([]);
  expect(await state()).toEqual(before);
});
