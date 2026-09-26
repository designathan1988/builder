// export-zip beyond its scenarios (spec/behavior/export-zip.md, Problems in Pager 8): the exported page looks like the
// canvas. The aurora project is opened and exported through the top bar's Export; the archive's index.html and
// css/styles.css are served to a new page of the same browser at the base breakpoint's width, and every element of
// the exported page has the same computed styles as its element on the canvas (the page's own elements in document
// order, the editor's aids apart: an empty container's minimum height).
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { unzip } from '../../tools/runner/unzip.ts';
import { runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const EXPORT = 'project.export#toolbar-top-bar-export';
// the computed properties compared, beyond the element's tag
const PROPERTIES = ['display', 'position', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color', 'background-color', 'text-align', 'border-top-width', 'box-sizing', 'flex-direction', 'gap'];

// every element of a page in document order, the body's included, with its tag and computed values
const styles = (root: Element, properties: readonly string[]) =>
  [root, ...root.querySelectorAll('*')].map((el) => {
    const computed = el.ownerDocument.defaultView?.getComputedStyle(el);
    return [el.localName, ...properties.map((p) => computed?.getPropertyValue(p) ?? '')].join('|');
  });

test('the exported page has the canvas\'s computed styles, element by element', runs(OPEN, EXPORT), async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
  // the canvas at 100 %, where the page lays out at the base breakpoint's width with whole pixels
  await page.keyboard.press('Control+0');
  const canvas = await page.frameLocator('.frame__page').locator('body').evaluate(styles, PROPERTIES);

  const download = page.waitForEvent('download');
  await runDoor(page, EXPORT);
  const archive = await (await download).path();
  const files = unzip(fs.readFileSync(archive));
  const html = files.get('index.html')?.toString('utf8');
  const css = files.get('css/styles.css')?.toString('utf8');
  if (html === undefined || css === undefined) throw new Error('the archive lacks index.html or css/styles.css');

  const exported: Page = await context.newPage();
  // the page's frame is the base breakpoint wide, less its scrollbar: the exported page gets the same layout width
  const width = await page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).contentDocument?.documentElement.clientWidth ?? 0);
  await exported.setViewportSize({ width, height: 900 });
  await exported.route('https://site.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return path === '/css/styles.css' ? route.fulfill({ contentType: 'text/css', body: css }) : route.fulfill({ contentType: 'text/html', body: html });
  });
  await exported.goto('https://site.test/index.html');
  const written = await exported.locator('body').evaluate(styles, PROPERTIES);
  expect(written.length, 'the exported page has the canvas\'s elements').toBe(canvas.length);
  expect(written).toEqual(canvas);
  await exported.close();
});
