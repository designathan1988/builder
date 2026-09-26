// element-attributes-aria beyond its scenarios: how a custom attribute's row is drawn in the Settings tab. Its name,
// its value field and its remove button lie on one line, the remove button after the field, all inside the inspector;
// the attribute itself is read through the read-only test port.
import { expect, test, type Page } from '../support/test.ts';
import { control, runDoor, runs } from './door.ts';

const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const ADD = 'element.setCustomAttribute#inspector-custom-attribute-add';
const VALUE = 'element.setCustomAttribute#inspector-custom-attribute-value';
const REMOVE = 'element.removeCustomAttribute#inspector-custom-attribute-remove';

interface Tree {
  readonly customAttributes?: Record<string, string>;
  readonly children: readonly Tree[];
}
const customOf = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return p.document().pages[0]?.tree.children[0]?.customAttributes ?? null;
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('a custom attribute\'s name, value field and remove button lie on one line inside the inspector', runs(INSERT_PANEL, TILE, SETTINGS, ADD), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  await runDoor(page, TILE, { args: { entry: 'button' } });
  await runDoor(page, SETTINGS);
  await control(page, ADD).locator('input').click();
  await page.keyboard.type('data-state');
  await page.keyboard.press('Enter');
  await expect.poll(() => customOf(page)).toEqual({ 'data-state': '' });
  const row = control(page, VALUE, { args: { name: 'data-state' } });
  const field = await row.locator('input').boundingBox();
  const remove = await row.locator(`[data-door="${REMOVE}"]`).boundingBox();
  const inspector = await page.locator('[data-region="inspector-settings"]').boundingBox();
  if (field === null || remove === null || inspector === null) throw new Error('the row is not drawn');
  expect(Math.abs(field.y + field.height / 2 - (remove.y + remove.height / 2)), 'the remove button is centred on the field\'s line').toBeLessThanOrEqual(2);
  expect(remove.x, 'the remove button comes after the field').toBeGreaterThanOrEqual(field.x + field.width);
  expect(remove.x + remove.width, 'the remove button lies inside the inspector').toBeLessThanOrEqual(inspector.x + inspector.width);
});
