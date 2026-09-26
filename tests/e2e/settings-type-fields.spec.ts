import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { control, runs } from './door.ts';

const INSERT = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const CHECK_TAB = 'workspace.setActiveTab#tab-strip-tab';
const ISSUE = 'selection.select#checks-issue';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const TITLE = 'element.setAttribute#inspector-title';
const EXPORT = 'project.export#toolbar-top-bar-export';
const EXPLORER = 'workspace.setPanelOpen#toolbar-activity-bar-explorer';
const LAYER = 'selection.select#layers-row';

const selected = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: { selection: () => string[] } }).__builderTestPort.selection());

// The issue is computed from the document and disappears after the field commits, without a reload.
test('Checks selects an untitled embedded frame and Title clears the issue and exports', runs(INSERT, TILE, CHECK_TAB, ISSUE, SETTINGS, TITLE, EXPORT), async ({ page }) => {
  await openEditor(page);
  await control(page, INSERT).click();
  await control(page, TILE, { args: { entry: 'embedded-frame' } }).click();
  await control(page, CHECK_TAB, { args: { group: 'workbench', panel: 'checks' } }).click();
  const issue = control(page, ISSUE);
  await expect(issue).toContainText('needs a title');
  await control(page, EXPLORER).click();
  await control(page, LAYER).first().click();
  await issue.click();
  expect((await selected(page))).toHaveLength(1);
  await control(page, SETTINGS).click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await title.click(); await page.keyboard.type('Document preview'); await page.keyboard.press('Enter');
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toContainText('No issues');
  const download = page.waitForEvent('download');
  await control(page, EXPORT).click();
  const files = unzip(fs.readFileSync(await (await download).path()));
  expect(files.get('index.html')?.toString('utf8')).toContain('title="Document preview"');
  await page.reload();
  await control(page, CHECK_TAB, { args: { group: 'workbench', panel: 'checks' } }).click();
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toContainText('No issues');
});

test('Page body title is labelled Tooltip and stays distinct from Page title', runs(SETTINGS, LAYER), async ({ page }) => {
  await openEditor(page);
  await control(page, LAYER).first().click();
  await control(page, SETTINGS).click();
  await expect(page.getByRole('textbox', { name: 'Tooltip' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toBeVisible();
});
