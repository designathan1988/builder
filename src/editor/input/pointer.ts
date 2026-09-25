// Pointer input (ARCHITECTURE.md): the one owner of pointer, mouse and drag input on the canvas. Lint rule
// builder/pointer-owner refuses pointer, mouse and drag listeners and props anywhere else; a control's onClick stays
// with the control. Presses reach the canvas on its overlay (the iframe takes no pointer event) and on the stage
// around the frame; the node under the pointer comes from the coordinates module.
//
// Each press is one gesture, run by an explicit state machine (idle → pressed → dragging → idle) whose threshold is
// the manifest's drag.threshold. The door of the press is found by its data (a canvas click's target, button, count
// and modifier), and the gesture's doors run through one transaction the pointer owner opens with store.gesture()
// when the press starts and commits when it ends, or cancels when the browser takes the pointer away: a whole
// gesture is one undo step, and no handler ever opens a transaction (lint rule builder/gesture-owner). A drag pressed
// on the empty area of the page or of a container is the marquee (spec marquee-select), whose band it publishes for
// the canvas chrome.
import { locate } from '../../core/document/model.ts';
import type { Gesture } from '../../core/store/store.ts';
import type { CommandId, KeyContextId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { canvasFrame, geometryOf, nodeAt, screenToPage, type Point } from '../canvas/coordinates.ts';
import type { EditorStore } from '../store.ts';

const threshold = manifest.interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
export const DRAG_THRESHOLD = typeof threshold === 'number' ? threshold : 4;

// What a press lands on: a node of the page (an element, or the page root where no element is), or the stage
// around the page.
export type Press = { readonly on: 'node'; readonly node: string; readonly root: boolean } | { readonly on: 'stage' };

// The gesture state machine. A press becomes a drag once the pointer has moved drag.threshold screen pixels from
// where it went down; below that, the release ends a click.
export type Machine =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pressed' | 'dragging'; readonly pointer: number; readonly start: Point; readonly press: Press };

export type MachineEvent =
  | { readonly type: 'down'; readonly pointer: number; readonly at: Point; readonly press: Press }
  | { readonly type: 'move'; readonly pointer: number; readonly at: Point }
  | { readonly type: 'up'; readonly pointer: number }
  | { readonly type: 'cancel' };

// what the owner does on a transition: open the gesture's transaction and run the press's door, start the drag of
// the press's source, commit the transaction, or cancel it
export type Effect = 'press' | 'drag' | 'commit' | 'cancel' | null;

export const IDLE: Machine = { phase: 'idle' };

export function step(machine: Machine, event: MachineEvent, dragThreshold = DRAG_THRESHOLD): { readonly machine: Machine; readonly effect: Effect } {
  if (event.type === 'cancel') return machine.phase === 'idle' ? { machine, effect: null } : { machine: IDLE, effect: 'cancel' };
  if (machine.phase === 'idle') {
    if (event.type !== 'down') return { machine, effect: null };
    return { machine: { phase: 'pressed', pointer: event.pointer, start: event.at, press: event.press }, effect: 'press' };
  }
  // another pointer (a second finger, a pen) does not join the gesture
  if (event.type === 'down' || event.pointer !== machine.pointer) return { machine, effect: null };
  if (event.type === 'up') return { machine: IDLE, effect: 'commit' };
  if (machine.phase === 'pressed' && Math.hypot(event.at.x - machine.start.x, event.at.y - machine.start.y) >= dragThreshold) {
    return { machine: { ...machine, phase: 'dragging' }, effect: 'drag' };
  }
  return { machine, effect: null };
}

// The canvas-click doors of the manifest, and whether one's target takes a press: "element-or-page" any node,
// "element" a node that is not the page root, "stage-outside-page" the stage. The other targets (a text element, an
// edited element, an interaction's target being picked) arrive with their features.
const CLICKS = manifest.doors.filter((d) => d.door.kind === 'canvas-click');
function takes(target: string, press: Press): boolean {
  if (target === 'element-or-page') return press.on === 'node';
  if (target === 'element') return press.on === 'node' && !press.root;
  if (target === 'stage-outside-page') return press.on === 'stage';
  return false;
}

export type Button = 'primary' | 'secondary';
export function clickDoor(press: Press, button: Button, count: number, modifier: string | null): DoorEntry | null {
  return CLICKS.find((d) => d.door.kind === 'canvas-click' && d.door.button === button && d.door.count === count && d.door.modifier === modifier && takes(d.door.target, press)) ?? null;
}

// A door's arguments for a press: its own, and the node it acts on when its adapter acts on the gesture's target.
function argsFor(entry: DoorEntry, press: Press): Record<string, unknown> {
  return entry.door.adapter.selection === 'target' && press.on === 'node' ? { ...entry.door.args, target: press.node } : { ...entry.door.args };
}

// The marquee (spec marquee-select): the canvas-drag door whose source is the empty area, and whether a press may
// start it. Its zone "page-or-container" takes a press on the page root or on a container's own area (not on a
// child); a press on a leaf is that element's drag, never a marquee. The mode is the one its gesture's modifier
// (interactions.json gestures) names, read at the press: a modifier's meaning starts with the mode it stands for
// ("add-to-selection"), and with no modifier the mode is the one no modifier names; a modifier the gesture does not
// know starts no marquee.
const MARQUEE = manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.source === 'empty-area') ?? null;
const CONTAINERS = new Set(manifest.elements.elements.filter((e) => e.content === 'children').map((e) => e.id));
function marqueeMode(entry: DoorEntry, press: Press, modifier: string | null, type: string | null): string | null {
  const door = entry.door;
  if (door.kind !== 'canvas-drag' || door.zone !== 'page-or-container' || press.on !== 'node') return null;
  if (!press.root && (type === null || !CONTAINERS.has(type))) return null;
  const gesture = manifest.interactions.gestures.find((g) => g.id === door.gesture);
  const modes = entry.command.args.mode?.values ?? [];
  const names = (mode: string, meaning: string) => meaning.startsWith(`${mode}-`);
  if (modifier === null) return modes.find((mode) => !(gesture?.modifiers ?? []).some((m) => names(mode, m.meaning))) ?? null;
  const meaning = gesture?.modifiers.find((m) => m.key === modifier)?.meaning;
  return meaning === undefined ? null : (modes.find((mode) => names(mode, meaning)) ?? null);
}

// The band of the marquee being drawn, in screen pixels, for the canvas chrome; null when no marquee is drawn.
// Pointer state, like the hovered node: the selection it makes goes through the store.
export interface Band {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
let drawnBand: Band | null = null;
const bandListeners = new Set<() => void>();
export const band = {
  get: (): Band | null => drawnBand,
  subscribe(listener: () => void): () => void {
    bandListeners.add(listener);
    return () => bandListeners.delete(listener);
  },
};
function setBand(next: Band | null) {
  if (next === drawnBand) return;
  drawnBand = next;
  for (const listener of [...bandListeners]) listener();
}

// The node the pointer hovers on the canvas, for the canvas chrome: set by pointer moves over the page, null
// elsewhere. Pointer state, not editor state: it changes no command.
let hovered: string | null = null;
const hoverListeners = new Set<() => void>();
export const hover = {
  get: (): string | null => hovered,
  subscribe(listener: () => void): () => void {
    hoverListeners.add(listener);
    return () => hoverListeners.delete(listener);
  },
};
function setHovered(node: string | null) {
  if (node === hovered) return;
  hovered = node;
  for (const listener of [...hoverListeners]) listener();
}

// While a gesture is open the keys belong to it: they are read in the drag key context and their doors run through
// the gesture's transaction (keymap.ts).
let open: Gesture | null = null;
export function openGesture(): { readonly context: KeyContextId; readonly gesture: Gesture } | null {
  return open !== null ? { context: 'drag', gesture: open } : null;
}

const MODIFIERS = [
  ['shiftKey', 'Shift'],
  ['ctrlKey', 'Ctrl'],
  ['altKey', 'Alt'],
  ['metaKey', 'Meta'],
] as const;
// the one modifier held, as the manifest names it; null for none (two held match no door). A panel control drawn
// for several doors of one gesture told apart by their modifier (a Layers row: click, Shift+click, Ctrl+click) runs
// the door of the modifier its click holds, read the same way.
export function modifierOf(event: Readonly<Record<(typeof MODIFIERS)[number][0], boolean>>): string | null {
  const held = MODIFIERS.filter(([key]) => event[key]).map(([, name]) => name);
  return held.length === 1 ? (held[0] ?? null) : held.length === 0 ? null : 'several';
}

// What a pointer event is on: the page under the overlay, the stage, or neither (the rest of the editor).
function pressAt(event: PointerEvent): Press | null | 'elsewhere' {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[data-canvas-overlay]')) {
    const frame = canvasFrame();
    const hit = frame ? nodeAt(frame, { x: event.clientX, y: event.clientY }) : null;
    return hit === null ? null : { on: 'node', node: hit.node, root: hit.root };
  }
  if (target?.hasAttribute('data-canvas-stage')) return { on: 'stage' };
  return 'elsewhere';
}

// Installs the pointer owner on the editor's window; returns its removal.
export function installPointer(store: EditorStore, target: Window = window): () => void {
  let machine: Machine = IDLE;
  let buttons: { button: Button; count: number; modifier: string | null } | null = null;
  // where the press went down, on the screen and in page pixels (null outside the page)
  let pressedAt: { screen: Point; page: Point | null } | null = null;
  // the marquee being drawn: its door and mode
  let marquee: { entry: DoorEntry; mode: string } | null = null;

  const pagePoint = (at: Point): Point | null => {
    const frame = canvasFrame();
    const g = frame ? geometryOf(frame) : null;
    return g ? screenToPage(at, g) : null;
  };

  // The marquee follows the pointer: every move selects anew from the selection the gesture started from, so the
  // gesture is cancelled (back to that selection) and opened again with the band from the press to the pointer.
  const drawMarquee = (at: Point) => {
    if (marquee === null || pressedAt === null || pressedAt.page === null) return;
    const to = pagePoint(at);
    if (to === null) return;
    const from = pressedAt.page;
    open?.cancel();
    open = store.gesture();
    const rect = { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y };
    open.dispatch(marquee.entry.command.id as CommandId, { ...marquee.entry.door.args, rect, mode: marquee.mode } as never);
    const s = pressedAt.screen;
    setBand({ x: Math.min(s.x, at.x), y: Math.min(s.y, at.y), width: Math.abs(at.x - s.x), height: Math.abs(at.y - s.y) });
  };

  const run = (effect: Effect) => {
    if (effect === 'press' && machine.phase !== 'idle' && buttons !== null) {
      open = store.gesture();
      const entry = clickDoor(machine.press, buttons.button, buttons.count, buttons.modifier);
      if (entry) open.dispatch(entry.command.id as CommandId, argsFor(entry, machine.press) as never);
    } else if (effect === 'drag' && machine.phase === 'dragging' && buttons?.button === 'primary' && MARQUEE !== null) {
      // a press on the empty area of the page or of a container becomes a marquee; what the press's click did is
      // undone, so the marquee starts from the selection held before the press
      const press = machine.press;
      const type = press.on === 'node' ? (locate(store.getState().document, press.node)?.node.type ?? null) : null;
      const mode = marqueeMode(MARQUEE, press, buttons.modifier, type);
      if (mode !== null) marquee = { entry: MARQUEE, mode };
    } else if (effect === 'commit' || effect === 'cancel') {
      const closing = open;
      open = null;
      marquee = null;
      pressedAt = null;
      setBand(null);
      if (effect === 'commit') closing?.commit();
      else closing?.cancel();
    }
    // 'drag' of an element, a palette tile or a Layers row: those drag doors arrive with the drag features; the
    // gesture stays one transaction
  };

  const onDown = (event: PointerEvent) => {
    const press = pressAt(event);
    if (press === null || press === 'elsewhere') return;
    if (event.button !== 0 && event.button !== 2) return;
    buttons = { button: event.button === 2 ? 'secondary' : 'primary', count: Math.min(Math.max(event.detail, 1), 2), modifier: modifierOf(event) };
    const at = { x: event.clientX, y: event.clientY };
    const next = step(machine, { type: 'down', pointer: event.pointerId, at, press });
    if (next.effect === 'press') pressedAt = { screen: at, page: pagePoint(at) };
    machine = next.machine;
    run(next.effect);
  };
  const onMove = (event: PointerEvent) => {
    const press = pressAt(event);
    setHovered(machine.phase === 'idle' && press !== null && press !== 'elsewhere' && press.on === 'node' ? press.node : null);
    const at = { x: event.clientX, y: event.clientY };
    const next = step(machine, { type: 'move', pointer: event.pointerId, at });
    machine = next.machine;
    run(next.effect);
    if (machine.phase === 'dragging' && event.pointerId === machine.pointer) drawMarquee(at);
  };
  const onUp = (event: PointerEvent) => {
    const next = step(machine, { type: 'up', pointer: event.pointerId });
    machine = next.machine;
    run(next.effect);
  };
  const onCancel = () => {
    const next = step(machine, { type: 'cancel' });
    machine = next.machine;
    run(next.effect);
    setHovered(null);
  };

  target.addEventListener('pointerdown', onDown, true);
  target.addEventListener('pointermove', onMove, true);
  target.addEventListener('pointerup', onUp, true);
  target.addEventListener('pointercancel', onCancel, true);
  target.addEventListener('blur', onCancel);
  return () => {
    onCancel();
    target.removeEventListener('pointerdown', onDown, true);
    target.removeEventListener('pointermove', onMove, true);
    target.removeEventListener('pointerup', onUp, true);
    target.removeEventListener('pointercancel', onCancel, true);
    target.removeEventListener('blur', onCancel);
  };
}
