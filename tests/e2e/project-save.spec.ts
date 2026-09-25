// project-save-json beyond its scenarios (spec/behavior/project-save-json.md, Problems in Pager 2): the same document
// saved twice gives byte-identical archives apart from the saved timestamp, which only the entries' modification
// time carries; project.json is exactly the document the test port reads. The archives are the browser's downloads,
// read by the runner's own unzip (tools/runner/unzip.ts).
import fs from 'node:fs';
import { expect, test, type Download, type Page } from '../support/test.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const SAVE = 'project.save#menu-file';

async function save(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await runDoor(page, SAVE);
  const file: Download = await download;
  expect(file.suggestedFilename()).toBe('project.zip');
  return fs.readFileSync(await file.path());
}

// the archive with the modification time and date of every local and central header set to zero
function withoutTimes(archive: Buffer): Buffer {
  const out = Buffer.from(archive);
  for (let i = 0; i + 4 <= out.length; i += 1) {
    const signature = out.readUInt32LE(i);
    if (signature === 0x04034b50) out.writeUInt32LE(0, i + 10);
    if (signature === 0x02014b50) out.writeUInt32LE(0, i + 12);
  }
  return out;
}

test('the same document saved twice gives the same archive apart from its time, and project.json is the document', runs('project.open#menu-file', SAVE), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.workbench')).toBeVisible();
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-intro"]')).toHaveCount(1);

  const first = await save(page);
  // two seconds later: the next DOS time step, so the times differ and only they do
  await page.waitForTimeout(2100);
  const second = await save(page);
  expect(withoutTimes(second).equals(withoutTimes(first)), 'the archives differ only in their times').toBe(true);

  const files = unzip(first);
  expect([...files.keys()]).toEqual(['project.json']);
  const document = await page.evaluate(() => (window as unknown as Record<string, { document: () => unknown }>).__builderTestPort?.document());
  expect(JSON.parse((files.get('project.json') as Buffer).toString('utf8'))).toEqual(document);
  expect(JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))).toEqual(document);
});
