// The census (the user's decision 5): no command works without a browser test that proves it, and no door looks
// usable without a command behind it. It reads the manifest (the built commands are the registered handlers of
// references.json), the doors every browser test names (its annotations "door", read from Playwright's own list of
// the suite), and the editor in Chrome with every menu and submenu opened. It fails when
//   - a door is drawn enabled while its command is not built;
//   - a built command has no test that runs one of its doors;
//   - a door of a built command that a user can run (drawn enabled, or a shortcut that runs by the keymap's own rule,
//     src/editor/input/shortcut-rule.ts) is run by no test.
// While the manifest has no built undoable command, a built command none of whose drawn doors is enabled (Undo and
// Redo: there is nothing to undo) is proven instead by a test that runs each of its doors and shows it cannot run yet
// (annotation "door-unavailable"); from the first undoable command on it needs tests of its own (the user's answer).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { shortcutRuns } from '../../src/editor/input/shortcut-rule.ts';
import { FEATURE_COMMANDS } from '../../src/generated/commands.ts';
import { DOOR_ANNOTATION, UNAVAILABLE_ANNOTATION, runDoor } from './door.ts';

interface Command {
  readonly id: string;
  readonly introducedBy: string;
  readonly history: { readonly undoable: boolean };
  readonly entryPoints: readonly { readonly id: string; readonly kind: string; readonly feature: string }[];
}
const COMMANDS: Command[] = [];
for (const file of fs.readdirSync('manifest/commands')) COMMANDS.push(...(JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: Command[] }).commands);
const REFERENCES = (JSON.parse(fs.readFileSync('manifest/references.json', 'utf8')) as { references: { kind: string; id: string; status: string }[] }).references;
const BUILT = new Set(REFERENCES.filter((r) => r.kind === 'handler' && r.status === 'registered').map((r) => r.id));
const UNDOABLE_BUILT = COMMANDS.some((c) => c.history.undoable && BUILT.has(c.id));
// a shortcut a user can press now: the keymap's own rule (src/editor/input/shortcut-rule.ts), on the manifest's data
const runs = (c: Command, d: Command['entryPoints'][number]) =>
  d.kind === 'shortcut' && shortcutRuns({ command: c.id, introducedBy: c.introducedBy, feature: d.feature }, (id) => BUILT.has(id), FEATURE_COMMANDS);

interface Listed {
  readonly specs?: readonly { readonly title: string; readonly tests: readonly { readonly annotations: readonly { readonly type: string; readonly description?: string }[] }[] }[];
  readonly suites?: readonly Listed[];
}
// the doors each annotation type names, over every test of the suite (Playwright's list, which starts no server)
function annotated(): Map<string, Set<string>> {
  const cli = path.join('node_modules', '@playwright', 'test', 'cli.js');
  const report = JSON.parse(execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as { suites: Listed[] };
  const found = new Map<string, Set<string>>();
  const walk = (suite: Listed) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) for (const a of t.annotations) if (a.description !== undefined) found.set(a.type, (found.get(a.type) ?? new Set()).add(a.description));
    for (const inner of suite.suites ?? []) walk(inner);
  };
  for (const suite of report.suites) walk(suite);
  return found;
}

test('every working command is proven by a browser test, and no door looks usable without a command', async ({ page }) => {
  // it visits every state a built door leads to, each from a fresh profile
  test.setTimeout(240_000);
  const tests = annotated();
  const runsDoor = tests.get(DOOR_ANNOTATION) ?? new Set<string>();
  const runsUnavailable = tests.get(UNAVAILABLE_ANNOTATION) ?? new Set<string>();

  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = async () => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.locator('.workbench')).toBeVisible();
  };

  // every door drawn on screen, and whether a user can use it: a control that is not disabled; a door drawn as a
  // container (a field row, a label) counts by the controls it holds that are not doors of their own. `drawn` keeps,
  // over every state the census reaches, whether a door was ever drawn enabled.
  const drawn = new Map<string, boolean>();
  const read = async (state: Map<string, boolean>) => {
    const seen = await page.evaluate(() => {
      const CONTROL = 'button, input, select, textarea, [role^="menuitem"], [role="treeitem"], [role="tab"], [tabindex]';
      const usable = (el: Element) => el.getAttribute('aria-disabled') !== 'true' && !el.matches(':disabled');
      return [...document.querySelectorAll('[data-door]')].map((el) => {
        const controls = el.matches(CONTROL) ? [el] : [...el.querySelectorAll(CONTROL)].filter((c) => c.closest('[data-door]') === el);
        return { ref: el.getAttribute('data-door') ?? '', control: controls.length > 0, enabled: controls.some(usable) };
      });
    });
    for (const d of seen) {
      if (!d.control) continue;
      state.set(d.ref, (state.get(d.ref) ?? false) || d.enabled);
      drawn.set(d.ref, (drawn.get(d.ref) ?? false) || d.enabled);
    }
  };
  // one state: the screen, then every menu and submenu opened in turn; `screen` keeps what the screen draws with no
  // menu open
  const readState = async () => {
    const state = new Map<string, boolean>();
    await read(state);
    const screen = new Set(state.keys());
    const buttons = page.locator('.menu-button[data-menu]');
    for (let m = 0; m < (await buttons.count()); m += 1) {
      await page.keyboard.press('Escape');
      // a menu button of a region the state hides (the canvas toolbar under a maximised dock) is not there to open
      if (!(await buttons.nth(m).isVisible())) continue;
      await buttons.nth(m).click();
      await read(state);
      const subs = page.locator('.menu__sub > [aria-haspopup="menu"]');
      for (let s = 0; s < (await subs.count()); s += 1) {
        await subs.nth(s).hover();
        await read(state);
      }
    }
    await page.keyboard.press('Escape');
    return { state, screen };
  };
  const commandOf = (ref: string) => ref.split('#')[0] ?? '';
  const KIND = new Map<string, string>(COMMANDS.flatMap((c) => c.entryPoints.map((d) => [`${c.id}#${d.id}`, d.kind] as const)));

  // Every place a built door can open: from a fresh profile, each door of a built command that is drawn enabled (and
  // each shortcut of one) is run once, from the first state it was seen in, and the state it leads to is read the same
  // way; a door first seen in such a state is run from there in turn. A door drawn only while a menu is open and not
  // an item of it (the backdrop under the menu) only closes that menu, back to the state it was opened in: it is
  // counted as drawn, and a test must run it, but it leads to no state of its own.
  const shortcuts = COMMANDS.filter((c) => BUILT.has(c.id)).flatMap((c) => c.entryPoints.filter((d) => runs(c, d)).map((d) => `${c.id}#${d.id}`));
  const explored = new Set<string>();
  const queue: string[][] = [[]];
  let states = 0;
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    await fresh();
    // a door drawn once per item (a Layers row, an Insert tile) is run on its first item
    for (const ref of path) await runDoor(page, ref, { any: true });
    const { state, screen } = await readState();
    states += 1;
    const leads = (ref: string) => screen.has(ref) || KIND.get(ref) === 'menu';
    const next = [...[...state].filter(([ref, enabled]) => enabled && BUILT.has(commandOf(ref)) && leads(ref)).map(([ref]) => ref), ...(path.length === 0 ? shortcuts : [])];
    for (const ref of next) {
      if (explored.has(ref)) continue;
      explored.add(ref);
      queue.push([...path, ref]);
    }
  }
  expect(drawn.size).toBeGreaterThan(200);
  expect(states).toBeGreaterThan(20);

  // a door drawn enabled has a built command behind it
  expect([...drawn].filter(([ref, enabled]) => enabled && !BUILT.has(commandOf(ref))).map(([ref]) => ref), 'enabled on screen without a built command').toEqual([]);

  const missing: string[] = [];
  for (const c of COMMANDS.filter((c) => BUILT.has(c.id))) {
    const refs = c.entryPoints.map((d) => `${c.id}#${d.id}`);
    const shown = refs.filter((r) => drawn.has(r));
    // a built command that cannot run yet: no drawn door is enabled, and nothing built can be undone
    const cannotRunYet = !UNDOABLE_BUILT && shown.length > 0 && shown.every((r) => drawn.get(r) === false);
    // the doors a user can run: drawn enabled, or a shortcut (a key needs no drawing)
    const reachable = c.entryPoints.filter((d) => runs(c, d) || drawn.get(`${c.id}#${d.id}`) === true).map((d) => `${c.id}#${d.id}`);
    if (cannotRunYet) {
      // every door drawn, and every shortcut, is shown to be unavailable
      const doors = c.entryPoints.filter((d) => runs(c, d) || drawn.has(`${c.id}#${d.id}`)).map((d) => `${c.id}#${d.id}`);
      for (const r of doors) if (!runsUnavailable.has(r)) missing.push(`${r}: no test shows it cannot run yet`);
      continue;
    }
    if (!refs.some((r) => runsDoor.has(r))) missing.push(`${c.id}: no browser test runs any of its doors`);
    for (const r of reachable) if (!runsDoor.has(r)) missing.push(`${r}: usable, and no browser test runs it`);
  }
  expect(missing, 'built commands and usable doors without a browser test').toEqual([]);
  console.log(`census: ${BUILT.size} built commands, ${states} states visited, ${drawn.size} doors drawn (${[...drawn.values()].filter(Boolean).length} enabled), ${runsDoor.size} doors run by tests, ${runsUnavailable.size} shown unavailable; built undoable commands: ${UNDOABLE_BUILT ? 'yes' : 'none'}`);
});
