// How a test runs a door of the manifest with the real mouse and keyboard, and how it names the doors it runs: one
// annotation "door" per door, so that a census of the tests can find a door no test runs.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, TestDetails } from '@playwright/test';

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
  // panel-control: the panel and the control it is drawn as
  readonly panel?: string;
  readonly control?: string;
  // toolbar and panel-control: the drawing (an "area" is part of a larger surface, such as a backdrop)
  readonly drawnAs?: string;
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

// opens a menu from its button, or from the menu it is a submenu of (English UI)
export async function openMenu(page: Page, id: string): Promise<void> {
  const menu = MENUS.find((m) => m.id === id);
  if (menu === undefined) throw new Error(`layout.json has no menu ${id}`);
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
// the door's only control, or with `any` the first of them.
export function control(page: Page, ref: string, options: { readonly args?: Readonly<Record<string, unknown>>; readonly any?: boolean } = {}): Locator {
  // a CSS string of any text: quoted with ', its backslashes and quotes escaped
  const css = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const given = Object.entries(options.args ?? {}).map(([name, value]) => `[data-args*=${css(`${JSON.stringify(name)}:${JSON.stringify(value)}`)}]`);
  const all = page.locator(`[data-door="${ref}"]${given.join('')}`);
  return options.any === true ? all.first() : all;
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
  // a door drawn as an area (the backdrop under a menu, a Layers row's name) is pressed where nothing drawn over it
  // lies, near its top-left corner, as a person clicks away from a menu; any other control at its centre
  const at = d.drawnAs === 'area' ? { position: { x: 4, y: 4 } } : undefined;
  if (d.kind === 'panel-control' && d.count === 2) await control(page, ref, options).dblclick(at);
  else await control(page, ref, options).click(at);
}
