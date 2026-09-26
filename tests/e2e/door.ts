// How a test runs a door of the manifest with the real mouse and keyboard, and how it names the doors it runs: one
// annotation "door" per door, so that a census of the tests can find a door no test runs.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, TestDetails } from '@playwright/test';
import { expect } from '../support/test.ts';

export interface Door {
  readonly id: string;
  readonly kind: string;
  readonly feature: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly menu?: string;
  readonly chord?: string;
  readonly context?: string;
  // canvas-click: what is clicked, with which button, how many times and which key held
  readonly target?: string;
  readonly button?: string;
  readonly count?: number;
  readonly modifier?: string | null;
  // canvas-drag and layers-drag: what is pressed and where it is released
  readonly source?: string;
  readonly zone?: string;
  readonly gesture?: string | null;
  // canvas-handle: the handle it is drawn as
  readonly handle?: string;
  // panel-control: the panel and the control it is drawn as
  readonly panel?: string;
  readonly control?: string;
  // toolbar and panel-control: the drawing (an "area" is part of a larger surface, such as a backdrop)
  readonly drawnAs?: string;
  // command-bar: the kind of entry it gives, and its label (with placeholders: "Insert {element}")
  readonly entry?: string;
  readonly labelKey?: string;
}
interface Menu {
  readonly id: string;
  readonly labelKey: string;
  readonly anchors: readonly { readonly region: string }[];
}

export const DOORS = new Map<string, Door>();
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: Door[] }[] };
  for (const c of commands) for (const d of c.entryPoints) DOORS.set(`${c.id}#${d.id}`, d);
}
const MENUS = (JSON.parse(fs.readFileSync('manifest/layout.json', 'utf8')) as { menus: Menu[] }).menus;
const EN = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;

export const DOOR_ANNOTATION = 'door';
// a door the test runs and finds it cannot run yet (its command is built, but what it acts on cannot exist yet)
export const UNAVAILABLE_ANNOTATION = 'door-unavailable';

// the details of a test that runs these doors
export function runs(...refs: string[]): TestDetails {
  for (const ref of refs) if (!DOORS.has(ref)) throw new Error(`the manifest has no door ${ref}`);
  return { annotation: refs.map((ref) => ({ type: DOOR_ANNOTATION, description: ref })) };
}

// the details of a test that runs these doors and shows each cannot run yet
export function runsUnavailable(...refs: string[]): TestDetails {
  for (const ref of refs) if (!DOORS.has(ref)) throw new Error(`the manifest has no door ${ref}`);
  return { annotation: refs.map((ref) => ({ type: UNAVAILABLE_ANNOTATION, description: ref })) };
}

export function door(ref: string): Door {
  const found = DOORS.get(ref);
  if (found === undefined) throw new Error(`the manifest has no door ${ref}`);
  return found;
}

// a chord of the manifest ("Ctrl+Alt+B", "Ctrl+\") as Playwright's keyboard writes it
const KEYS: Record<string, string> = { Ctrl: 'Control', '\\': 'Backslash' };
export const keys = (chord: string): string => chord.split('+').map((k) => KEYS[k] ?? (k.length === 1 ? k.toLowerCase() : k)).join('+');

// The quick panel (src/editor/canvas/quick-panel.tsx) opens from its chip, which is no door (DESIGN.md: opening the
// quick panel is data-local): a door drawn in it (its fields, More actions) and its grip are reached by opening it
// first, as a person clicks the chip beside the selection.
const QUICK_PANEL_GRIP = 'quick-panel-grip';
export const inQuickPanel = (d: Door): boolean => d.kind === 'quick-panel' || (d.kind === 'panel-drag' && d.source === QUICK_PANEL_GRIP);
export async function openQuickPanel(page: Page): Promise<void> {
  const chip = page.locator('[data-quick-panel-chip][aria-expanded="false"]');
  if ((await chip.count()) > 0) await chip.click();
  await page.locator('[data-quick-panel-chip][aria-expanded="true"]').waitFor();
}

// The command bar (src/editor/shell/command-bar.tsx) opens from the top bar's Commands field, which a click reaches
// wherever the focus is (a field keeps Ctrl+K: DESIGN.md "Keyboard model"); an entry is picked as a person picks it:
// its label typed into the bar's field (English UI), then its row clicked. An insert entry's label names its palette
// entry and an open-panel entry's its panel; a placeholder a command's label fills in from the state is left out.
const PALETTE_LABELS = new Map((JSON.parse(fs.readFileSync('manifest/elements.json', 'utf8')) as { palette: { entries: { id: string; labelKey: string }[] }[] }).palette.flatMap((g) => g.entries.map((e) => [e.id, e.labelKey] as const)));
const PANEL_LABELS = (JSON.parse(fs.readFileSync('manifest/layout.json', 'utf8')) as { panels: Record<string, { labelKey: string }> }).panels;
const BAR_FIELD = [...DOORS.entries()].find(([ref, d]) => ref.startsWith('commandBar.open#') && d.kind === 'toolbar')?.[0];
export function barLabel(d: Door, args: Readonly<Record<string, unknown>>): string {
  const template = EN[d.labelKey ?? ''];
  if (template === undefined) throw new Error(`the catalogue has no label ${d.labelKey}`);
  const filled: Record<string, string | undefined> = {
    element: typeof args.entry === 'string' ? EN[PALETTE_LABELS.get(args.entry) ?? ''] : undefined,
    panel: typeof args.panel === 'string' ? EN[PANEL_LABELS[args.panel]?.labelKey ?? ''] : undefined,
  };
  return template.replace(/\{(\w+)\}/g, (_, name: string) => filled[name] ?? '').replace(/\s+/g, ' ').trim();
}
export async function openCommandBar(page: Page): Promise<void> {
  if (BAR_FIELD === undefined) throw new Error('commandBar.open has no toolbar door');
  const field = page.locator('[data-region="command-palette"] [role="combobox"]');
  // a bar already open (a door before opened it) is typed into as it is: its backdrop covers the top bar
  if ((await field.count()) === 0) await page.locator(`[data-door="${BAR_FIELD}"]`).click();
  // a bar that does not open fails on an assertion, never on a wait's timeout
  await expect(field, 'the command bar opens').toBeVisible();
  await field.click();
  await page.keyboard.press('Control+A');
}

// opens a menu from its button, or from the menu it is a submenu of (English UI)
export async function openMenu(page: Page, id: string): Promise<void> {
  const menu = MENUS.find((m) => m.id === id);
  if (menu === undefined) throw new Error(`layout.json has no menu ${id}`);
  // the menu buttons are drawn with the editor: count them only once it is on screen (counting right after a
  // navigation raced the first render and read "no button" for a menu that has one)
  await page.locator('.workbench').waitFor();
  const button = page.locator(`.menu-button[data-menu="${id}"]`);
  if ((await button.count()) > 0) {
    // a menu with more than one button (Zoom: the canvas toolbar and the status bar) opens from the first
    await button.first().click();
    return;
  }
  const parent = menu.anchors.find((a) => a.region.startsWith('menu:'));
  const name = EN[menu.labelKey];
  if (parent === undefined || name === undefined) throw new Error(`menu ${id} has no button and is no submenu`);
  await openMenu(page, parent.region.slice('menu:'.length));
  await page.getByRole('menuitem', { name, exact: true }).hover();
}

// The control of a door drawn once per item it stands for (a Layers row per node, an Insert tile per palette entry):
// the one whose arguments (data-args, written by the door's drawing) hold every argument given. Without arguments,
// the door's only control, or with `any` the first of them that is available (a field's parts are drawn for every
// field, those of a feature still to come unavailable; the census runs only a door it read available).
export function control(page: Page, ref: string, options: { readonly args?: Readonly<Record<string, unknown>>; readonly any?: boolean } = {}): Locator {
  // a CSS string of any text: quoted with ', its backslashes and quotes escaped
  const css = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const given = Object.entries(options.args ?? {}).map(([name, value]) => `[data-args*=${css(`${JSON.stringify(name)}:${JSON.stringify(value)}`)}]`);
  const all = page.locator(`[data-door="${ref}"]${given.join('')}`);
  if (options.any !== true) return all;
  const available = page.locator(`[data-door="${ref}"]${given.join('')}:not([aria-disabled="true"]):not([disabled])`);
  return available.first();
}

// Any drawn control, of any door, that stands for these arguments (a canvas handle standing for itself: its arrows are
// keys of another command, handle.step).
export function standingControl(page: Page, args: Readonly<Record<string, unknown>>): Locator {
  const css = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const given = Object.entries(args).map(([name, value]) => `[data-args*=${css(`${JSON.stringify(name)}:${JSON.stringify(value)}`)}]`);
  return page.locator(`[data-door]${given.join('')}`);
}

// A panel control's door with a key held (a Layers row's Shift+click) is drawn by the control of the same gesture
// with no key held: the door of the same panel, control and gesture whose modifier is null. A panel control's door
// pressed with the secondary button (a Layers row's secondary click, its `button`) is drawn by the control of the same
// panel and control that the primary button runs with no key held.
export function modifiedControl(ref: string): { readonly drawn: string; readonly key: 'Shift' | 'Control' | 'Alt' | 'Meta' | null; readonly button: 'left' | 'right' } | null {
  const d = door(ref);
  const secondary = d.button === 'secondary';
  if (d.kind !== 'panel-control' || ((d.modifier === null || d.modifier === undefined) && !secondary)) return null;
  const drawn = [...DOORS].find(
    ([, o]) => o.kind === 'panel-control' && o.panel === d.panel && o.control === d.control && (secondary || o.gesture === d.gesture) && (o.modifier ?? null) === null && o.button === undefined,
  )?.[0];
  if (drawn === undefined) throw new Error(`${ref}: no control of ${d.panel ?? ''} ${d.control ?? ''} is drawn for its gesture with no key held`);
  const KEY = { Shift: 'Shift', Ctrl: 'Control', Alt: 'Alt', Meta: 'Meta' } as const;
  const key = d.modifier === null || d.modifier === undefined ? null : (KEY[d.modifier as keyof typeof KEY] as (typeof KEY)[keyof typeof KEY] | undefined);
  if (key === undefined) throw new Error(`${ref}: unknown modifier ${String(d.modifier)}`);
  return { drawn, key, button: secondary ? 'right' : 'left' };
}

// runs a door as a user does: a shortcut by its keys, a menu item from its menu, a panel control's door with a key
// held by a click on its control with that key held, one pressed with the secondary button by a secondary click on
// its control, a panel control its door counts two clicks for (a Layers row's name) by a double-click, any other
// control by a click
export async function runDoor(page: Page, ref: string, options: { readonly args?: Readonly<Record<string, unknown>>; readonly any?: boolean } = {}): Promise<void> {
  const d = door(ref);
  const modified = modifiedControl(ref);
  if (modified !== null) {
    await control(page, modified.drawn, options).click({ modifiers: modified.key === null ? [] : [modified.key], button: modified.button });
    return;
  }
  if (d.kind === 'shortcut') {
    if (d.chord === undefined) throw new Error(`shortcut ${ref} has no chord`);
    await page.keyboard.press(keys(d.chord));
    return;
  }
  if (d.kind === 'menu') {
    if (d.menu === undefined) throw new Error(`menu door ${ref} names no menu`);
    await openMenu(page, d.menu);
  }
  if (d.kind === 'command-bar') {
    await openCommandBar(page);
    await page.keyboard.type(barLabel(d, { ...d.args, ...options.args }));
  }
  if (inQuickPanel(d)) await openQuickPanel(page);
  // a door drawn as an area (the backdrop under a menu, a Layers row's name) is pressed where nothing drawn over it
  // lies, near its top-left corner, as a person clicks away from a menu; any other control at its centre
  const at = d.drawnAs === 'area' ? { position: { x: 4, y: 4 } } : undefined;
  if (d.kind === 'panel-control' && d.count === 2) await control(page, ref, options).dblclick(at);
  else await control(page, ref, options).click(at);
}
