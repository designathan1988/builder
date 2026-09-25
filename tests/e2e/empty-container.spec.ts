// An empty container on the canvas (manifest constant canvas.emptyContainerMinHeight, spec/behavior/drag-drop-inside.md
// and palette-click-insert.md): the canvas gives it a visible minimum height, editor-only, so it can be seen and
// clicked; a container with children, and the page root, keep their own height. Nothing of it enters the document
// JSON nor the node's own markup (no inline style, no class): the renderer marks it in the frame only.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const constants = (JSON.parse(fs.readFileSync('manifest/interactions.json', 'utf8')) as { constants: { id: string; value: unknown }[] }).constants;
const MIN_HEIGHT = constants.find((c) => c.id === 'canvas.emptyContainerMinHeight')?.value;

const port = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; selection: () => string[] }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), selection: p.selection() };
  });

// the computed min-height and height of a node's element inside the frame, and the attributes the node's own markup
// would carry (its inline style and class)
function measured(page: Page, id: string | null) {
  return page.evaluate((node) => {
    const doc = document.querySelector<HTMLIFrameElement>('.frame__page')?.contentDocument;
    if (!doc) throw new Error('the canvas has no page');
    const el = node === null ? doc.body : doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node ?? 'the page'}`);
    const style = getComputedStyle(el);
    return { minHeight: style.minHeight, height: el.getBoundingClientRect().height, style: el.getAttribute('style'), class: el.getAttribute('class') };
  }, id);
}

test('an empty container keeps the editor-only minimum height on the canvas and can be clicked; the document gains nothing', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page'), async ({ page }) => {
  expect(typeof MIN_HEIGHT, 'the manifest gives canvas.emptyContainerMinHeight').toBe('number');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as unknown;
  await expect.poll(async () => (await port(page)).document).toEqual(fixture);
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-actions"]')).toHaveCount(1);

  // Actions: an empty div with no styles of its own
  const actions = await measured(page, 'n-actions');
  expect(actions.minHeight, 'the empty container: computed min-height').toBe(`${String(MIN_HEIGHT)}px`);
  expect(actions.height, 'the empty container: height inside the frame').toBeCloseTo(MIN_HEIGHT as number, 1);
  expect({ style: actions.style, class: actions.class }, 'the empty container: no inline style, no class').toEqual({ style: null, class: null });
  // Hero has children, the page root is the page: neither takes the minimum (Chrome computes a block's auto
  // min-height as 0px)
  expect((await measured(page, 'n-hero')).minHeight, 'a container with children: computed min-height').toBe('0px');
  expect((await measured(page, null)).minHeight, 'the page root: computed min-height').toBe('0px');

  // a click on it selects it, as a person selects on the canvas
  const at = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector('[data-node="n-actions"]');
    if (!iframe || !el) throw new Error('the canvas does not draw n-actions');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  });
  await page.mouse.click(at.x, at.y);
  const after = await port(page);
  expect(after.selection, 'the click selects the empty container').toEqual(['n-actions']);
  expect(after.document, 'the document JSON gains nothing').toEqual(fixture);
});
