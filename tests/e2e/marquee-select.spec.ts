// marquee-select beyond its scenarios (spec/behavior/marquee-select.md): the band the canvas chrome draws while the
// pointer drags (src/editor/canvas/chrome.tsx), the selection following the band live (src/editor/input/pointer.ts),
// and what selection.marquee takes (src/core/selection/selection.ts): only what lies in the container the band was
// pressed in, a leaf when touched, a container when held entirely and then in its descendants' place, Ctrl toggling;
// a press on a leaf is never a marquee. Points are given in page pixels of the aurora fixture at the fit zoom and
// mapped to the screen through the frame's content box and CSS zoom; the selection is read through the read-only
// test port.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const MARQUEE = 'selection.marquee#canvas-drag-empty-area-page-or-container';

interface Point {
  readonly x: number;
  readonly y: number;
}

const selection = (page: Page) => page.evaluate(() => (window as unknown as Record<string, { selection: () => string[] }>).__builderTestPort?.selection());

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-door="project.open#menu-file"]').click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-intro"]')).toHaveCount(1);
}

// a page point (the page's CSS pixels, not scrolled) on the screen: the iframe's content box scaled by its CSS zoom
function screen(page: Page, at: Point): Promise<Point> {
  return page.evaluate((p) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    if (!iframe) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const box = iframe.getBoundingClientRect();
    const style = getComputedStyle(iframe);
    const left = box.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * zoom;
    const top = box.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * zoom;
    return { x: left + p.x * zoom, y: top + p.y * zoom };
  }, at);
}

// presses at `from` (with a modifier held), moves past the drag threshold and on to each point, keeping the button down
async function pressAndMove(page: Page, from: Point, to: Point, modifier: string | null = null) {
  const start = await screen(page, from);
  const end = await screen(page, to);
  await page.mouse.move(start.x, start.y);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  return { start, end };
}
async function release(page: Page, modifier: string | null = null) {
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test(
  'while the pointer drags, the band lies from the press to the pointer and the selection follows it live; the release keeps it and takes the band away',
  runs('project.open#menu-file', MARQUEE),
  async ({ page }) => {
    // from Hero's top-left padding to the middle of Intro: Title and Intro are touched, before any release
    const { start, end } = await pressAndMove(page, { x: 20, y: 20 }, { x: 720, y: 153 });
    const band = page.locator('[data-chrome="band"]');
    await expect
      .poll(async () => {
        const box = await band.boundingBox();
        const near = (a: number, b: number) => Math.abs(a - b) <= 1;
        return box !== null && near(box.x, start.x) && near(box.y, start.y) && near(box.width, end.x - start.x) && near(box.height, end.y - start.y);
      }, { message: 'the band lies from the press to the pointer' })
      .toBe(true);
    expect(await band.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
    expect(await selection(page)).toEqual(['n-title', 'n-intro']);
    await expect(page.getByRole('status')).toHaveText('2 elements selected.');

    // back up to the middle of Title: the band touches Title only, recomputed from the selection at the press
    const back = await screen(page, { x: 720, y: 100 });
    await page.mouse.move(back.x, back.y, { steps: 4 });
    expect(await selection(page)).toEqual(['n-title']);

    await release(page);
    await expect(band).toHaveCount(0);
    expect(await selection(page)).toEqual(['n-title']);
    // one element is named, as a click names it
    await expect(page.getByRole('status')).toHaveText('Title selected.');
  },
);

test('a band that touches nothing replaces the selection with nothing, and the status bar says so', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', MARQUEE), async ({ page }) => {
  const intro = await screen(page, { x: 720, y: 153 });
  await page.mouse.click(intro.x, intro.y);
  expect(await selection(page)).toEqual(['n-intro']);
  // inside Hero's top padding only
  await pressAndMove(page, { x: 20, y: 20 }, { x: 600, y: 60 });
  await release(page);
  expect(await selection(page)).toEqual([]);
  await expect(page.getByRole('status')).toHaveText('Nothing selected.');
});

test('with Shift held, the band adds to the selection held at the press, and gives up what it no longer touches', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', MARQUEE), async ({ page }) => {
  const note = await screen(page, { x: 720, y: 500 });
  await page.mouse.click(note.x, note.y);
  expect(await selection(page)).toEqual(['n-note']);
  // over Title and Intro, then back to Title only: Intro leaves again, the Note stays first
  await pressAndMove(page, { x: 20, y: 20 }, { x: 720, y: 153 }, 'Shift');
  expect(await selection(page)).toEqual(['n-note', 'n-title', 'n-intro']);
  const back = await screen(page, { x: 720, y: 100 });
  await page.mouse.move(back.x, back.y, { steps: 4 });
  await release(page, 'Shift');
  expect(await selection(page)).toEqual(['n-note', 'n-title']);
  await expect(page.getByRole('status')).toHaveText('2 elements selected.');
});

test('a band pressed in a container takes only what lies in that container, however far the pointer goes', runs('project.open#menu-file', MARQUEE), async ({ page }) => {
  // from Hero's padding down over Plans to the Footer's Note: only Hero's Title and Intro are touched in Hero
  await pressAndMove(page, { x: 20, y: 20 }, { x: 720, y: 500 });
  await release(page);
  expect(await selection(page)).toEqual(['n-title', 'n-intro']);
});

test('a container is taken when the band holds it entirely, in its descendants\' place; one only touched gives its leaves', runs('project.open#menu-file', MARQUEE), async ({ page }) => {
  // from the empty page area below the Footer up over Perks and the Footer, the full width: Perks and the Footer are
  // held, Plans and its Grid only touched (their top edges lie above the band) and nothing of the Grid is touched
  await pressAndMove(page, { x: 1436, y: 700 }, { x: 4, y: 420 });
  await release(page);
  expect(await selection(page)).toEqual(['n-perks', 'n-footer']);
  await expect(page.getByRole('status')).toHaveText('2 elements selected.');
});

test('with Ctrl held at the press, the band toggles what it takes in the selection', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page', MARQUEE), async ({ page }) => {
  const title = await screen(page, { x: 720, y: 100 });
  await page.mouse.click(title.x, title.y);
  expect(await selection(page)).toEqual(['n-title']);
  // over Title and Intro: Title leaves the selection, Intro joins it
  await pressAndMove(page, { x: 20, y: 20 }, { x: 720, y: 153 }, 'Control');
  await release(page, 'Control');
  expect(await selection(page)).toEqual(['n-intro']);
});

test('a press on a leaf and a drag is never a marquee: no band is drawn and the click\'s selection stays', runs('project.open#menu-file', 'selection.select#canvas-click-element-or-page'), async ({ page }) => {
  await pressAndMove(page, { x: 720, y: 153 }, { x: 20, y: 20 });
  await expect(page.locator('[data-chrome="band"]')).toHaveCount(0);
  await release(page);
  expect(await selection(page)).toEqual(['n-intro']);
});
