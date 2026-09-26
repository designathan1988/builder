// A door whose command is not built stands for no current state (ARCHITECTURE.md "Door rendering"): in the
// accessibility tree none says it is pressed, selected or checked, and on screen none looks selected, neither beside
// the other doors of its command in the same place (the dock's tabs, the breakpoint tabs, the view segments) nor
// as a row beside the other rows of the sidebar. The built commands are the registered handlers of references.json.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';

const BUILT = (JSON.parse(fs.readFileSync('manifest/references.json', 'utf8')) as { references: { kind: string; id: string; status: string }[] }).references
  .filter((r) => r.kind === 'handler' && r.status === 'registered')
  .map((r) => r.id);

// The regions the editor draws at its start, and the doors of unbuilt commands the manifest places in them: each is
// drawn, and so checked; the doors of one command placed side by side in one of them are compared with each other.
const START_REGIONS: readonly string[] = ['top-bar', 'activity-bar', 'canvas-toolbar', 'status-bar', 'dock-strip', 'canvas-frame'];
const PLACED_AT_START = fs
  .readdirSync('manifest/commands')
  .flatMap((file) => (JSON.parse(fs.readFileSync(`manifest/commands/${file}`, 'utf8')) as { commands: { id: string; entryPoints: { id: string; placement: { region: string } | string }[] }[] }).commands)
  .filter((c) => !BUILT.includes(c.id))
  .flatMap((c) => c.entryPoints.flatMap((d) => (typeof d.placement === 'object' && START_REGIONS.includes(d.placement.region) ? [{ ref: `${c.id}#${d.id}`, command: c.id, region: d.placement.region }] : [])));

interface Drawn {
  readonly ref: string;
  // "aria-pressed", "aria-selected" or "aria-checked" when it says true, else null
  readonly state: string | null;
  // the door's place (its parent) and command, so doors drawn side by side compare with each other
  readonly group: string;
  // its computed colours, weight and shadow
  readonly look: string;
  // the computed background and shadow of the sidebar row it sits in, or null
  readonly row: string | null;
}

// every drawn door of a command that is not built, and the look of an unselected row of the sidebar
function unbuiltDoors(page: Page) {
  return page.evaluate((built) => {
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color, s.fontWeight, s.boxShadow, s.borderTopColor, s.borderBottomColor].join(' ');
    };
    const rowLook = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.boxShadow].join(' ');
    };
    const places = new Map<Element, number>();
    const doors: Drawn[] = [];
    for (const el of document.querySelectorAll('[data-door]')) {
      const ref = el.getAttribute('data-door') ?? '';
      const command = ref.split('#')[0] ?? '';
      if (built.includes(command)) continue;
      const parent = el.parentElement;
      if (parent !== null && !places.has(parent)) places.set(parent, places.size);
      const row = el.parentElement?.closest('.sidebar .row') ?? null;
      // its shape: the element, its role and its classes without the state ones (is-current, is-unavailable, ...)
      const shape = [el.tagName, el.getAttribute('role') ?? '', ...[...el.classList].filter((c) => !c.startsWith('is-')).sort()].join(' ');
      doors.push({
        ref,
        state: ['aria-pressed', 'aria-selected', 'aria-checked'].find((a) => el.getAttribute(a) === 'true') ?? null,
        group: `${parent === null ? -1 : places.get(parent)} ${command} ${shape}`,
        look: look(el),
        row: row === null ? null : rowLook(row),
      });
    }
    const plain = document.querySelector('.sidebar .row[aria-selected="false"]');
    return { doors, plainRow: plain === null ? null : rowLook(plain) };
  }, BUILT);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('no door of a command that is not built says or looks as if it stood for the current state', async ({ page }) => {
  // the pointer rests where no control is, so no hover colours a door
  await page.mouse.move(720, 500);
  const { doors, plainRow } = await unbuiltDoors(page);
  // every door of an unbuilt command the manifest places in a region drawn at start is among them
  expect(PLACED_AT_START.length).toBeGreaterThan(0);
  expect(PLACED_AT_START.map((p) => p.ref).filter((ref) => !doors.some((d) => d.ref === ref))).toEqual([]);
  expect(doors.filter((d) => d.state !== null).map((d) => `${d.ref} ${d.state}`)).toEqual([]);

  const groups = new Map<string, Drawn[]>();
  for (const d of doors) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  const sideBySide = [...groups.values()].filter((g) => g.length > 1);
  // every set of two or more doors of one command the manifest places in one region drawn at start (the view segments)
  // is drawn side by side and compared
  const bySet = new Map<string, typeof PLACED_AT_START>();
  for (const p of PLACED_AT_START) bySet.set(`${p.region} ${p.command}`, [...(bySet.get(`${p.region} ${p.command}`) ?? []), p]);
  const expectedSets = [...bySet.values()].filter((set) => set.length > 1);
  expect(expectedSets.length).toBeGreaterThan(0);
  for (const set of expectedSets) expect(sideBySide.some((group) => set.every((p) => group.some((d) => d.ref === p.ref))), `${set.map((p) => p.ref).join(', ')} compared side by side`).toBe(true);
  for (const group of sideBySide) {
    const first = group[0];
    if (first === undefined) continue;
    expect(group.filter((d) => d.look !== first.look).map((d) => d.ref), `looks different from ${first.ref}`).toEqual([]);
  }

  expect(plainRow).not.toBeNull();
  expect(doors.filter((d) => d.row !== null && d.row !== plainRow).map((d) => d.ref)).toEqual([]);

  // Any element, a door or any wrapper of one, that looks current only through a state marker (the classes
  // is-current, is-active and is-selected, an ARIA pressed, selected or checked "true") must stand for a built door:
  // be one, hold one, or sit inside one, or inherit its look from such an element. The markers are taken off the whole
  // page and every computed look compared, with transitions off so each look settles at once.
  const drawnCurrent = await page.evaluate((built) => {
    const still = document.createElement('style');
    still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.append(still);
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color, s.fontWeight, s.boxShadow, s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor, s.outlineColor, s.textDecorationLine, s.opacity].join(' ');
    };
    const all = [...document.querySelectorAll('body *')];
    const before = all.map(look);
    for (const el of all) {
      for (const marker of ['is-current', 'is-active', 'is-selected']) el.classList.remove(marker);
      for (const aria of ['aria-pressed', 'aria-selected', 'aria-checked']) if (el.getAttribute(aria) === 'true') el.setAttribute(aria, 'false');
    }
    const isBuilt = (door: Element | null) => door !== null && built.includes((door.getAttribute('data-door') ?? '').split('#')[0] ?? '');
    const standsForBuilt = (el: Element) => isBuilt(el.closest('[data-door]')) || [...el.querySelectorAll('[data-door]')].some(isBuilt);
    const changed = new Set(all.filter((el, i) => look(el) !== before[i]));
    const justified = new Set<Element>();
    const unjustified: string[] = [];
    for (const el of all) {
      if (!changed.has(el)) continue;
      const parent = el.parentElement;
      if (standsForBuilt(el) || (parent !== null && justified.has(parent))) justified.add(el);
      else if (parent === null || !changed.has(parent)) unjustified.push(el.getAttribute('data-door') ?? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
    }
    return { changed: changed.size, unjustified };
  }, BUILT);
  // the built doors that stand for the current state now (the Explorer, the canvas tools, the Layers toggle) change
  expect(drawnCurrent.changed).toBeGreaterThan(0);
  expect(drawnCurrent.unjustified).toEqual([]);
});

test('no menu item of a command that is not built is checked', async ({ page }) => {
  const buttons = page.locator('.menu-button[data-menu]');
  expect(await buttons.count()).toBeGreaterThan(4);
  // the items of the open menus whose command is not built and that say they are checked
  const checkedItems = () =>
    page
      .locator('.menu[role="menu"] [data-door]')
      .evaluateAll((els, built) => els.filter((el) => !built.includes((el.getAttribute('data-door') ?? '').split('#')[0] ?? '') && el.getAttribute('aria-checked') === 'true').map((el) => el.getAttribute('data-door') ?? ''), BUILT);
  const checked: string[] = [];
  let items = 0;
  for (let m = 0; m < (await buttons.count()); m += 1) {
    await page.keyboard.press('Escape');
    await buttons.nth(m).click();
    items += await page.locator('.menu[role="menu"] [data-door]').count();
    checked.push(...(await checkedItems()));
    const subs = page.locator('.menu__sub > [aria-haspopup="menu"]');
    for (let i = 0; i < (await subs.count()); i += 1) {
      await subs.nth(i).hover();
      checked.push(...(await checkedItems()));
    }
  }
  expect(items).toBeGreaterThan(40);
  // a menu stays open while its submenus are hovered, so an item can be read more than once
  expect([...new Set(checked)]).toEqual([]);
});
