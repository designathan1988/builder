// File › Open (project.open, its menu-file door) reads a project document through the browser's file chooser, as a
// user opens one, and the canvas renders it: the page inside the frame is the document's tree, with its text and its
// styles. A file that is not a project document, or one of a newer format, is refused with the reason and the canvas
// keeps what it had. This is how the scenarios load their fixtures (manifest/features/fixtures/).
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openEditor } from '../support/editor.ts';
import { openMenu, runs } from './door.ts';

interface Node {
  readonly id: string;
  readonly tag: string;
  readonly text?: unknown;
  readonly styles: Record<string, Record<string, Record<string, string>>>;
  readonly children?: readonly Node[];
}
const FIXTURE = 'manifest/features/fixtures/aurora.json';
const aurora = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { pages: { tree: Node }[] };
const nodes: Node[] = [];
const walk = (n: Node) => {
  nodes.push(n);
  for (const c of n.children ?? []) walk(c);
};
for (const p of aurora.pages) walk(p.tree);

const frame = (page: Page) => page.frameLocator('.frame__page');
// the page's elements inside the frame, in document order: [node id, tag]
const rendered = (page: Page) => frame(page).locator('[data-node]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-node'), el.tagName.toLowerCase()]));

async function open(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles(file);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('File › Open renders the chosen project document in the canvas', runs('project.open#menu-file'), async ({ page }) => {
  const before = await rendered(page);
  await open(page, { name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect.poll(() => rendered(page)).toEqual(nodes.map((n) => [n.id, n.tag]));
  expect(before).not.toEqual(await rendered(page));

  const title = nodes.find((n) => n.tag === 'h1');
  const hero = nodes.find((n) => n.styles.desktop?.base?.['padding-top'] !== undefined);
  if (!title || !hero) throw new Error('aurora.json has no h1 or no padded section');
  await expect(frame(page).locator(`[data-node="${title.id}"]`)).toHaveText(String(title.text));
  const padding = await frame(page)
    .locator(`[data-node="${hero.id}"]`)
    .evaluate((el) => ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map((p) => getComputedStyle(el).getPropertyValue(p)));
  expect(padding).toEqual(['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map((p) => hero.styles.desktop?.base?.[p]));
});

test('the canvas iframe takes no pointer event: a click on the page lands on the overlay above it', runs('project.open#menu-file'), async ({ page }) => {
  await open(page, { name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  const title = nodes.find((n) => n.tag === 'h1');
  if (!title) throw new Error('aurora.json has no h1');
  await expect(frame(page).locator(`[data-node="${title.id}"]`)).toBeVisible();
  // the title's centre on the screen: its box in the page, scaled by the frame's CSS zoom and placed at the frame
  const hit = await page.evaluate((id) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector(`[data-node="${id}"]`);
    if (!iframe || !el) return 'no title';
    const r = iframe.getBoundingClientRect();
    const zoom = r.width / iframe.offsetWidth;
    const e = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + (e.left + e.width / 2) * zoom, r.top + (e.top + e.height / 2) * zoom);
    return at ? `${at.tagName.toLowerCase()}.${[...at.classList].join('.')}` : null;
  }, title.id);
  expect(hit).toBe('div.frame__overlay');
});

test('a Layers row draws its caret alone, named by its label', runs('project.open#menu-file'), async ({ page }) => {
  await open(page, { name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  const carets = page.locator('[data-region="layers-row"] .door--disclosure');
  await expect.poll(() => carets.count()).toBeGreaterThan(3);
  const drawn = await carets.evaluateAll((els) => els.map((el) => ({ text: el.textContent, label: el.getAttribute('aria-label') })));
  expect(drawn.filter((c) => c.text !== '' || c.label === null || c.label === '')).toEqual([]);
});

test('File › Open refuses a file that is not a project document, and one of a newer format, and keeps the canvas', runs('project.open#menu-file'), async ({ page }) => {
  const before = await rendered(page);
  const status = page.getByRole('status');
  await open(page, { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('not a project') });
  await expect(status).toContainText('This file is not a valid project archive:');
  expect(await rendered(page)).toEqual(before);

  const newer = { ...JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), version: 99 };
  await open(page, { name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await expect(status).toHaveText('This project uses format version 99, which this app cannot read.');
  expect(await rendered(page)).toEqual(before);
});
