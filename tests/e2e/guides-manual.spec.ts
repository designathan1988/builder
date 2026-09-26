// guides-manual beyond its scenarios (spec/behavior/guides-manual.md): a press and release on a ruler with no movement
// makes no guide (Problems in Pager 2); while a guide is dragged over its own ruler, the ruler says a release deletes it
// (Problems in Pager 1), and the release does. The scenarios cannot hold a drag halfway: this test does, with the real
// mouse, and reads the document.
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runs } from './door.ts';

const FROM_TOP = 'guides.create#canvas-drag-top-ruler-page';
const DROP = 'guides.delete#canvas-drag-guide-own-ruler';

type Port = { document: () => { pages: { tree: { guides?: unknown[] } }[] } };
const guideCount = (page: Page) => page.evaluate(() => (window as unknown as { __builderTestPort: Port }).__builderTestPort.document().pages[0]?.tree.guides?.length ?? 0);

test('a click on a ruler makes no guide; a guide held over its ruler shows the delete hint and is deleted there', runs(FROM_TOP, DROP), async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const ruler = page.locator('[data-ruler="horizontal"]');
  const box = await ruler.boundingBox();
  if (box === null) throw new Error('no top ruler');
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // a click: no guide
  await page.mouse.click(middle.x, middle.y);
  expect(await guideCount(page)).toBe(0);
  // out of the ruler onto the page: one guide
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => guideCount(page)).toBe(1);
  // the guide taken back over its ruler: the hint, then the release deletes it
  const guide = page.locator('[data-guide="horizontal-1"]');
  const line = await guide.boundingBox();
  if (line === null) throw new Error('the guide is not drawn');
  await page.mouse.move(middle.x, line.y + line.height / 2);
  await page.mouse.down();
  await page.mouse.move(middle.x, line.y + line.height / 2 - 40, { steps: 4 });
  await page.mouse.move(middle.x, middle.y, { steps: 10 });
  await expect(ruler.locator('.ruler__hint')).toBeVisible();
  await page.mouse.up();
  await expect(ruler.locator('.ruler__hint')).toHaveCount(0);
  await expect.poll(() => guideCount(page)).toBe(0);
});
