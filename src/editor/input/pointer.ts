// Pointer input (ARCHITECTURE.md): the one owner of pointer, mouse and drag input on the canvas. Lint rule
// builder/pointer-owner refuses pointer, mouse and drag listeners and props anywhere else; a control's onClick stays
// with the control. Presses reach the canvas on its overlay (the iframe takes no pointer event) and on the stage
// around the frame; the node under the pointer comes from the coordinates module.
//
// Each press is one gesture, run by an explicit state machine (idle → pressed → dragging → idle) whose threshold is
// the manifest's drag.threshold. The door of the press is found by its data (a canvas click's target, button, count
// and modifier), and the gesture's doors run through one transaction the pointer owner opens with store.gesture()
// when the press starts and commits when it ends, or cancels when the browser takes the pointer away: a whole
// gesture is one undo step, and no handler ever opens a transaction (lint rule builder/gesture-owner).
import type { Gesture } from '../../core/store/store.ts';
import type { CommandId, KeyContextId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { canvasFrame, nodeAt, type Point } from '../canvas/coordinates.ts';
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

  const run = (effect: Effect) => {
    if (effect === 'press' && machine.phase !== 'idle' && buttons !== null) {
      open = store.gesture();
      const entry = clickDoor(machine.press, buttons.button, buttons.count, buttons.modifier);
      if (entry) open.dispatch(entry.command.id as CommandId, argsFor(entry, machine.press) as never);
    } else if (effect === 'commit' || effect === 'cancel') {
      const closing = open;
      open = null;
      if (effect === 'commit') closing?.commit();
      else closing?.cancel();
    }
    // 'drag': the drag doors of a press's source arrive with the drag features; the gesture stays one transaction
  };

  const onDown = (event: PointerEvent) => {
    const press = pressAt(event);
    if (press === null || press === 'elsewhere') return;
    if (event.button !== 0 && event.button !== 2) return;
    buttons = { button: event.button === 2 ? 'secondary' : 'primary', count: Math.min(Math.max(event.detail, 1), 2), modifier: modifierOf(event) };
    const next = step(machine, { type: 'down', pointer: event.pointerId, at: { x: event.clientX, y: event.clientY }, press });
    machine = next.machine;
    run(next.effect);
  };
  const onMove = (event: PointerEvent) => {
    const press = pressAt(event);
    setHovered(machine.phase === 'idle' && press !== null && press !== 'elsewhere' && press.on === 'node' ? press.node : null);
    const next = step(machine, { type: 'move', pointer: event.pointerId, at: { x: event.clientX, y: event.clientY } });
    machine = next.machine;
    run(next.effect);
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
