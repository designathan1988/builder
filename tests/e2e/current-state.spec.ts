// A door whose command is not built stands for no current state (ARCHITECTURE.md "Door rendering"): in the
// accessibility tree none says it is pressed, selected or checked, and on screen none looks selected, neither beside
// the other doors of its command in the same place (the dock's tabs, the breakpoint tabs, the view segments) nor
// as a row beside the other rows of the sidebar. The built commands are the registered handlers of references.json.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const BUILT = (JSON.parse(fs.readFileSync('manifest/references.json', 'utf8')) as { references: { kind: string; id: string; status: string }[] }).references
  .filter((r) => r.kind === 'handler' && r.status === 'registered')
  .map((r) => r.id);

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
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
});

test('no door of a command that is not built says or looks as if it stood for the current state', async ({ page }) => {
  // the pointer rests where no control is, so no hover colours a door
  await page.mouse.move(720, 500);
  const { doors, plainRow } = await unbuiltDoors(page);
  expect(doors.length).toBeGreaterThan(100);
  expect(doors.filter((d) => d.state !== null).map((d) => `${d.ref} ${d.state}`)).toEqual([]);

  const groups = new Map<string, Drawn[]>();
  for (const d of doors) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  const sideBySide = [...groups.values()].filter((g) => g.length > 1);
  // the dock's tabs, the breakpoint tabs, the view segments and the palette tiles are among them
  expect(sideBySide.length).toBeGreaterThan(3);
  for (const group of sideBySide) {
    const first = group[0];
    if (first === undefined) continue;
    expect(group.filter((d) => d.look !== first.look).map((d) => d.ref), `looks different from ${first.ref}`).toEqual([]);
  }

  expect(plainRow).not.toBeNull();
  expect(doors.filter((d) => d.row !== null && d.row !== plainRow).map((d) => d.ref)).toEqual([]);
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
