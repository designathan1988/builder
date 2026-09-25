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
// on the empty area of the page or of a container with children is the marquee (spec marquee-select), whose band it
// publishes for the canvas chrome.
//
// A primary press on any other element (a leaf, an empty container) that turns into a drag drags the selection's
// roots (the press has just selected the element): each move asks the drop proposal (src/editor/drag/drop.ts) where
// they would land, publishes it for the canvas chrome (hysteresis: drag.hysteresis), and the release runs the
// canvas-drag door of the drawn proposal's zone (beside a sibling, or inside a container) with its parent and index,
// inside the same gesture.
import { locate, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { Gesture } from '../../core/store/store.ts';
import { selectionRoots } from '../../core/structure/remove.ts';
import type { CommandId, KeyContextId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { canvasFrame, flowAxis, geometryOf, nodeAt, nodeBox, nodesUnder, screenToPage, type Point } from '../canvas/coordinates.ts';
import { proposeDrop, type DropProposal } from '../drag/drop.ts';
import type { EditorStore } from '../store.ts';

const threshold = manifest.interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
export const DRAG_THRESHOLD = typeof threshold === 'number' ? threshold : 4;
const hysteresis = manifest.interactions.constants.find((c) => c.id === 'drag.hysteresis')?.value;
if (typeof hysteresis !== 'number') throw new Error('interactions.json has no number drag.hysteresis');
export const DRAG_HYSTERESIS = hysteresis;

// What a press lands on: a node of the page (an element, or the page root where no element is), or the stage
// around the page.
// A press on the canvas chrome's label of an element is a press on that element (`label`: never a marquee).
export type Press = { readonly on: 'node'; readonly node: string; readonly root: boolean; readonly label?: boolean } | { readonly on: 'stage' };

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
// child); a press on a leaf, or on an empty container (whose marquee could take nothing, having no descendants), is
// that element's drag, never a marquee (specs drag-reorder-canvas, drag-drop-inside). The mode is the one its gesture's modifier
// (interactions.json gestures) names, read at the press: a modifier's meaning starts with the mode it stands for
// ("add-to-selection"), and with no modifier the mode is the one no modifier names; a modifier the gesture does not
// know starts no marquee.
const MARQUEE = manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.source === 'empty-area') ?? null;
const CONTAINERS = new Set(manifest.elements.elements.filter((e) => e.content === 'children').map((e) => e.id));
function marqueeMode(entry: DoorEntry, press: Press, modifier: string | null, node: { readonly type: string; readonly children: readonly unknown[] } | null): string | null {
  const door = entry.door;
  if (door.kind !== 'canvas-drag' || door.zone !== 'page-or-container' || press.on !== 'node' || press.label === true) return null;
  if (!press.root && (node === null || !CONTAINERS.has(node.type) || node.children.length === 0)) return null;
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

// Where the last press went down on the screen, whatever it pressed (the canvas, a Layers row): the context menu opens
// there (spec context-menu: "a menu at the pointer"). Pointer state: it changes no command.
let lastPress: Point | null = null;
export const pressPoint = (): Point | null => lastPress;

// The browser's own menu never opens where the editor's opens (spec context-menu, Problems in Pager 5): on the canvas
// (the overlay and the stage) and over the editor's context menu and its backdrop, which a secondary press on the
// canvas draws before the browser asks for its menu at the release.
const EDITOR_MENU_AREA ='[data-canvas-overlay], [data-canvas-stage], [data-context-menu]';

// The canvas-drag doors a press on an element starts (specs drag-reorder-canvas, drag-drop-inside): the door of the
// zone a drop proposal falls in, found by its data: "before-after" beside a sibling, "inside" into a container (a
// refused proposal, over the dragged nodes' own subtree, is one inside them). The gesture's own modifiers
// (interactions.json) are the only keys a drag press may hold: an element drag holds none.
const ELEMENT_DRAGS = manifest.doors.filter((d) => d.door.kind === 'canvas-drag' && d.door.source === 'canvas-element');
const zoneDoor = (zone: string) => ELEMENT_DRAGS.find((d) => d.door.kind === 'canvas-drag' && d.door.zone === zone) ?? null;
const REORDER = zoneDoor('before-after');
const INTO = zoneDoor('inside');
const dropDoor = (proposal: DropProposal) => (proposal.placement === 'inside' ? INTO : REORDER);
const DRAG_MODIFIERS = new Set(manifest.interactions.gestures.find((g) => REORDER?.door.kind === 'canvas-drag' && g.id === REORDER.door.gesture)?.modifiers.map((m) => m.key) ?? []);

// The drag in progress, for the canvas chrome: the nodes dragged and the drop proposal drawn now (the one a release
// commits). Pointer state, not editor state: nothing changes until the release.
export interface DragView {
  readonly dragged: readonly NodeId[];
  readonly proposal: DropProposal | null;
}
let dragView: DragView | null = null;
const dragListeners = new Set<() => void>();
export const drag = {
  get: (): DragView | null => dragView,
  subscribe(listener: () => void): () => void {
    dragListeners.add(listener);
    return () => dragListeners.delete(listener);
  },
};
function setDrag(next: DragView | null) {
  if (next === dragView) return;
  dragView = next;
  for (const listener of [...dragListeners]) listener();
}

// The proposal a pointer position makes now, measured on the page through the coordinates module.
function proposalAt(document: DocumentJson, dragged: readonly NodeId[], at: Point): DropProposal | null {
  const frame = canvasFrame();
  const g = frame ? geometryOf(frame) : null;
  if (!frame || !g) return null;
  return proposeDrop(document, (type) => CONTAINERS.has(type), dragged, nodesUnder(frame, at), at, {
    zoom: g.zoom,
    box: (id) => nodeBox(frame, id),
    axis: (id) => flowAxis(frame, id),
  });
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

// What a pointer event is on: the label of an element on the canvas chrome (spec select-click, "Hit zones": the
// selection label and the hover label select or drag the element they name), the page under the overlay, the
// stage, or neither (the rest of the editor).
function pressAt(event: PointerEvent, isRoot: (node: string) => boolean): Press | null | 'elsewhere' {
  const target = event.target instanceof Element ? event.target : null;
  const named = target?.closest('[data-canvas-overlay] [data-label-for]')?.getAttribute('data-label-for') ?? null;
  if (named !== null) return { on: 'node', node: named, root: isRoot(named), label: true };
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
  // an element drag: what it moves, the proposal drawn and where the pointer was when it was taken (drag.hysteresis)
  let dragging: { readonly dragged: readonly NodeId[]; proposal: DropProposal | null; takenAt: Point | null } | null = null;
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
    } else if (effect === 'drag' && machine.phase === 'dragging' && buttons?.button === 'primary') {
      const press = machine.press;
      const node = press.on === 'node' ? (locate(store.getState().document, press.node as NodeId)?.node ?? null) : null;
      // a press on the empty area of the page or of a container with children becomes a marquee; what the press's
      // click did is undone, so the marquee starts from the selection held before the press
      const mode = MARQUEE === null ? null : marqueeMode(MARQUEE, press, buttons.modifier, node);
      const plain = buttons.modifier === null || DRAG_MODIFIERS.has(buttons.modifier as never);
      if (MARQUEE !== null && mode !== null) marquee = { entry: MARQUEE, mode };
      else if (ELEMENT_DRAGS.length > 0 && press.on === 'node' && !press.root && plain) {
        // any other press on an element drags the selection's roots, which the press has just made that element
        const state = store.getState();
        const dragged = selectionRoots(state.document, state.selection).map((at) => at.node.id);
        if (dragged.length > 0) {
          dragging = { dragged, proposal: null, takenAt: null };
          setDrag({ dragged, proposal: null });
        }
      }
    } else if (effect === 'commit' || effect === 'cancel') {
      const closing = open;
      const dropped = dragging?.proposal ?? null;
      open = null;
      dragging = null;
      setDrag(null);
      marquee = null;
      pressedAt = null;
      setBand(null);
      // the release commits exactly the proposal drawn last, through the door of its zone, in the gesture's transaction
      const door = dropped === null ? null : dropDoor(dropped);
      if (effect === 'commit' && dropped !== null && door !== null) closing?.dispatch(door.command.id, { ...door.door.args, parent: dropped.parent, index: dropped.index } as never);
      if (effect === 'commit') closing?.commit();
      else closing?.cancel();
    }
  };

  // While an element drag goes on, each pointer position proposes a drop; a new proposal replaces the drawn one only
  // once the pointer is drag.hysteresis screen pixels from where the drawn one was taken.
  const over = (at: Point) => {
    if (dragging === null) return;
    const next = proposalAt(store.getState().document, dragging.dragged, at);
    if (JSON.stringify(next) === JSON.stringify(dragging.proposal)) return;
    if (dragging.takenAt !== null && Math.hypot(at.x - dragging.takenAt.x, at.y - dragging.takenAt.y) < DRAG_HYSTERESIS) return;
    dragging.proposal = next;
    dragging.takenAt = at;
    setDrag({ dragged: dragging.dragged, proposal: next });
  };

  const isRoot = (node: string) => locate(store.getState().document, node as NodeId)?.parent === null;
  const onDown = (event: PointerEvent) => {
    lastPress = { x: event.clientX, y: event.clientY };
    const press = pressAt(event, isRoot);
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
    const press = pressAt(event, isRoot);
    setHovered(machine.phase === 'idle' && press !== null && press !== 'elsewhere' && press.on === 'node' ? press.node : null);
    const at = { x: event.clientX, y: event.clientY };
    const next = step(machine, { type: 'move', pointer: event.pointerId, at });
    machine = next.machine;
    run(next.effect);
    // the gesture's drag in progress, if any: the marquee's band, or an element's drop proposal
    if (machine.phase === 'dragging' && event.pointerId === machine.pointer) {
      drawMarquee(at);
      over(at);
    }
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
  // While a press on the canvas is held, the browser neither selects the editor's text nor starts its own drag and
  // drop of it: a native drag would take the pointer away (pointercancel) and end the gesture.
  const onNative = (event: Event) => {
    if (machine.phase !== 'idle') event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(EDITOR_MENU_AREA)) event.preventDefault();
  };
  // A secondary press there moves no focus: the context menu it opens takes the focus at once, and the press would
  // otherwise hand it to the page body right after.
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 2 && event.target instanceof Element && event.target.closest(EDITOR_MENU_AREA)) event.preventDefault();
  };

  target.addEventListener('pointerdown', onDown, true);
  target.addEventListener('pointermove', onMove, true);
  target.addEventListener('pointerup', onUp, true);
  target.addEventListener('pointercancel', onCancel, true);
  target.addEventListener('contextmenu', onContextMenu, true);
  target.addEventListener('mousedown', onMouseDown, true);
  target.addEventListener('blur', onCancel);
  target.addEventListener('selectstart', onNative, true);
  target.addEventListener('dragstart', onNative, true);
  return () => {
    onCancel();
    target.removeEventListener('pointerdown', onDown, true);
    target.removeEventListener('pointermove', onMove, true);
    target.removeEventListener('pointerup', onUp, true);
    target.removeEventListener('pointercancel', onCancel, true);
    target.removeEventListener('contextmenu', onContextMenu, true);
    target.removeEventListener('mousedown', onMouseDown, true);
    target.removeEventListener('blur', onCancel);
    target.removeEventListener('selectstart', onNative, true);
    target.removeEventListener('dragstart', onNative, true);
  };
}
