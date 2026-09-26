// elements-tables beyond its scenarios: the Settings tab's Caption, Head and Footer toggles say what the selected
// table holds. A toggle is drawn filled with the accent exactly while the table holds its part (a new table holds its
// head, not its caption nor its foot), and a click adds or removes the part and turns the toggle over. The document is
// read through the read-only test port; the toggles' drawing through their computed style.
import { expect, test, type Page } from '../support/test.ts';
import { control, runDoor, runs } from './door.ts';

const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const CAPTION = 'parts.toggle#inspector-table-caption-toggle';
const HEAD = 'parts.toggle#inspector-table-head-toggle';
const FOOT = 'parts.toggle#inspector-table-foot-toggle';

interface Tree {
  readonly tag: string | null;
  readonly children: readonly Tree[];
}
// the tags of the parts of the page's first element (the table)
const parts = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return p.document().pages[0]?.tree.children[0]?.children.map((c) => c.tag) ?? [];
  });
// the accent fill a toggle that is on is drawn with (the token, as the editor resolves it)
const accentFill = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-accent-soft').trim());
const fill = (page: Page, ref: string) => control(page, ref).evaluate((el) => getComputedStyle(el).backgroundColor);
// a colour as the browser computes it, for comparison with a computed background
const computed = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = c;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, colour);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('the table toggles are drawn on exactly for the parts the table holds, and a click turns them over', runs(INSERT_PANEL, TILE, SETTINGS, CAPTION, HEAD, FOOT), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  await runDoor(page, TILE, { args: { entry: 'table' } });
  await expect.poll(() => parts(page)).toEqual(['thead', 'tbody']);
  await runDoor(page, SETTINGS);
  const on = await computed(page, await accentFill(page));
  expect(on).not.toBe('rgba(0, 0, 0, 0)');
  expect(await fill(page, HEAD)).toBe(on);
  expect(await fill(page, CAPTION)).not.toBe(on);
  expect(await fill(page, FOOT)).not.toBe(on);
  await runDoor(page, CAPTION);
  await expect.poll(() => parts(page)).toEqual(['caption', 'thead', 'tbody']);
  await expect.poll(() => fill(page, CAPTION)).toBe(on);
  await runDoor(page, HEAD);
  await expect.poll(() => parts(page)).toEqual(['caption', 'tbody']);
  await expect.poll(() => fill(page, HEAD)).not.toBe(on);
  await runDoor(page, FOOT);
  await expect.poll(() => parts(page)).toEqual(['caption', 'tbody', 'tfoot']);
  await expect.poll(() => fill(page, FOOT)).toBe(on);
});
