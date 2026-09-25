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
//
// A double-click on a text element starts its edit in place; while a text is edited, a press elsewhere keeps the text
// once its own door has run (spec text-edit-inline).
//
// A primary press on a palette tile (the tile door of the command whose canvas-drag door takes a palette tile as its
// source) is a gesture too (spec palette-drag-insert, "Trigger"): released below drag.threshold it is the tile's click
// and runs the tile's door at the release; past the threshold it is a creation drag with no dragged node, which asks
// the same drop proposal and publishes it for the same drop indicator, and whose release runs the palette-drag door
// with the tile's entry and the drawn proposal's parent and index, inside the gesture: one undo step. Released where
// there is no proposal (outside the page), it inserts nothing. A drag cancelled by drag.cancel (drag-session.ts)
// ends its gesture without committing it.
import { isFeatureBuilt } from '../../app/features.ts';
import type { Message } from '../../core/commands/registry.ts';
import { locate, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { Gesture } from '../../core/store/store.ts';
import { selectionRoots } from '../../core/structure/remove.ts';
import type { CommandId, DoorId, FeatureId, KeyContextId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { canvasFrame, flowAxis, geometryOf, nodeAt, nodeBox, nodesUnder, screenToPage, type Point } from '../canvas/coordinates.ts';
import { proposeDrop, type DropProposal } from '../drag/drop.ts';
import type { EditorStore } from '../store.ts';
import { editArgs, editedNode, isTextElement } from '../canvas/text-edit.ts';

const threshold = manifest.interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
export const DRAG_THRESHOLD = typeof threshold === 'number' ? threshold : 4;
const hysteresis = manifest.interactions.constants.find((c) => c.id === 'drag.hysteresis')?.value;
if (typeof hysteresis !== 'number') throw new Error('interactions.json has no number drag.hysteresis');
export const DRAG_HYSTERESIS = hysteresis;

// What a press lands on: a node of the page (an element, or the page root where no element is), or the stage
// around the page.
// A press on the canvas chrome's label of an element is a press on that element (`label`: never a marquee).
// A press on a palette tile carries the tile's door and the arguments the tile stands for (its entry).
export type Press =
  | { readonly on: 'node'; readonly node: string; readonly root: boolean; readonly label?: boolean }
  | { readonly on: 'stage' }
  | { readonly on: 'tile'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>> };

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

// What the canvas knows of a press beyond where it lands: whether its node is a text element, and the node whose text
// is edited in place (text-edit.ts), if any.
export interface PressFacts {
  readonly textual: boolean;
  readonly edited: string | null;
}
const NO_FACTS: PressFacts = { textual: false, edited: null };

// The canvas-click doors of the manifest, and whether one's target takes a press: "element-or-page" any node,
// "element" a node that is not the page root, "stage-outside-page" the stage, "text-element" a text element,
// "outside-edited-element" anywhere but the element whose text is edited (while one is). The other targets (an
// interaction's target being picked, a form control) arrive with their features.
const CLICKS = manifest.doors.filter((d) => d.door.kind === 'canvas-click');
const OUTSIDE_EDIT = 'outside-edited-element';
function takes(target: string, press: Press, facts: PressFacts): boolean {
  if (target === 'element-or-page') return press.on === 'node';
  if (target === 'element') return press.on === 'node' && !press.root;
  if (target === 'stage-outside-page') return press.on === 'stage';
  if (target === 'text-element') return press.on === 'node' && !press.root && facts.textual;
  // a press on a palette tile is no press on the canvas: it keeps no text
  if (target === OUTSIDE_EDIT) return press.on !== 'tile' && facts.edited !== null && !(press.on === 'node' && press.node === facts.edited);
  return false;
}

export type Button = 'primary' | 'secondary';
const matches = (d: DoorEntry, button: Button, count: number, modifier: string | null) => d.door.kind === 'canvas-click' && d.door.button === button && d.door.count === count && d.door.modifier === modifier;
// The door a press runs.
export function clickDoor(press: Press, button: Button, count: number, modifier: string | null, facts: PressFacts = NO_FACTS): DoorEntry | null {
  return CLICKS.find((d) => matches(d, button, count, modifier) && d.door.kind === 'canvas-click' && d.door.target !== OUTSIDE_EDIT && takes(d.door.target, press, facts)) ?? null;
}
// The door a press outside the edited text runs first, keeping the text (spec text-edit-inline: a click elsewhere
// keeps it, and selects there): null when no text is edited or the press is on it.
export function editEndDoor(press: Press, button: Button, count: number, modifier: string | null, facts: PressFacts): DoorEntry | null {
  return CLICKS.find((d) => matches(d, button, count, modifier) && d.door.kind === 'canvas-click' && d.door.target === OUTSIDE_EDIT && takes(d.door.target, press, facts)) ?? null;
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

// The creation drag of a palette tile (spec palette-drag-insert): the canvas-drag door whose source is a palette tile,
// and the tiles it starts from, the doors of the same command drawn as tiles (their clicks insert at the selection).
// It runs once its feature is registered as built in the feature table (src/app/features.ts); until then a tile's
// press is the tile's own click.
const PALETTE_DRAG = manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.source === 'palette-tile') ?? null;
const paletteDragBuilt = PALETTE_DRAG !== null && isFeatureBuilt(PALETTE_DRAG.door.feature as FeatureId);
const isTile = (entry: DoorEntry) => paletteDragBuilt && entry.command.id === PALETTE_DRAG?.command.id && entry.door.kind === 'panel-control' && entry.door.control === 'tile';
// Whether the pointer owner runs the presses of a drawn control (a palette tile): its click then comes from here, and
// the control's own onClick runs only an activation with no press (assistive technology's, or a key's).
export function pressedByPointer(entry: DoorEntry): boolean {
  return isTile(entry);
}

// The drag in progress, for the canvas chrome: the nodes dragged, or, for a palette tile's creation drag, none and
// the palette entry it inserts; the drop proposal drawn now (the one a release commits) and, for a creation drag, the
// refusal its drop would meet there (the command's own, store.refusal: a parent that does not accept the element,
// spec palette-drag-insert, Problems in Pager 3); and where the pointer is on the screen (the ghost of a creation drag
// follows it). Pointer state, not editor state: nothing changes until the release.
export interface DragView {
  readonly dragged: readonly NodeId[];
  readonly inserting: string | null;
  readonly proposal: DropProposal | null;
  readonly refusal: Message | null;
  readonly at: Point;
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
function pressAt(event: MouseEvent, isRoot: (node: string) => boolean): Press | null | 'elsewhere' {
  const target = event.target instanceof Element ? event.target : null;
  const named = target?.closest('[data-canvas-overlay] [data-label-for]')?.getAttribute('data-label-for') ?? null;
  if (named !== null) return { on: 'node', node: named, root: isRoot(named), label: true };
  if (target?.closest('[data-canvas-overlay]')) {
    const frame = canvasFrame();
    const hit = frame ? nodeAt(frame, { x: event.clientX, y: event.clientY }) : null;
    return hit === null ? null : { on: 'node', node: hit.node, root: hit.root };
  }
  if (target?.hasAttribute('data-canvas-stage')) return { on: 'stage' };
  // a palette tile that is available (a tile of a feature not built yet is drawn disabled and takes no press)
  const control = target?.closest('[data-door]');
  const entry = manifest.doorByRef.get((control?.getAttribute('data-door') ?? '') as DoorId);
  if (control && entry && isTile(entry) && control.getAttribute('aria-disabled') !== 'true') {
    const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    return { on: 'tile', entry, args: args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {} };
  }
  return 'elsewhere';
}

// Installs the pointer owner on the editor's window; returns its removal.
export function installPointer(store: EditorStore, target: Window = window): () => void {
  let machine: Machine = IDLE;
  let buttons: { button: Button; count: number; modifier: string | null } | null = null;
  // an element drag, or a palette tile's creation drag: what it moves (nothing for a tile), the palette entry it
  // inserts (a tile's), the proposal drawn, the refusal its drop would meet (a creation drag's), and where the pointer
  // was when it was taken (drag.hysteresis)
  let dragging: {
    readonly dragged: readonly NodeId[];
    readonly inserting: string | null;
    proposal: DropProposal | null;
    refusal: Message | null;
    takenAt: Point | null;
  } | null = null;
  // the press of the gesture, while one is open: a tile's press decides its click or its drop at the release
  let pressed: Press | null = null;
  // where the pointer is on the screen, from its last press or move
  let pointerAt: Point = { x: 0, y: 0 };
  // the drags cancelled when the gesture opened (drag-session.ts): a newer cancellation ends the gesture
  let cancelsAtOpen = 0;
  // where the press went down, on the screen and in page pixels (null outside the page)
  let pressedAt: { screen: Point; page: Point | null } | null = null;
  // the marquee being drawn: its door and mode
  let marquee: { entry: DoorEntry; mode: string } | null = null;
  // whether the press just handled leaves the focus where it is: in the text edited in place, which the press
  // started or landed on (the browser would otherwise move the focus to the editor's page body at the mousedown)
  let keepFocus = false;
  // the door that keeps the text a press outside it left, with the edit's arguments, run once the gesture closes
  let keeping: { entry: DoorEntry; args: Record<string, unknown> } | null = null;

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

  const factsOf = (press: Press): PressFacts => {
    const state = store.getState();
    return { textual: press.on === 'node' && isTextElement(state.document, press.node), edited: editedNode(state) };
  };

  const run = (effect: Effect) => {
    if (effect === 'press' && machine.phase !== 'idle' && buttons !== null) {
      const press = machine.press;
      // a press outside the text edited in place keeps that text: the edit's node and text are read now, before the
      // press's own door (a selection elsewhere) ends the edit, and its door runs once the gesture closes, as a
      // dispatch of its own (text.set records one transaction per dispatch and never joins a gesture); the press's own
      // door records nothing, so the press is one undo step, and the status bar ends on the kept text
      const ending = editEndDoor(press, buttons.button, buttons.count, buttons.modifier, factsOf(press));
      const endArgs = ending ? editArgs(store.getState(), ending.command) : null;
      keeping = ending && endArgs ? { entry: ending, args: endArgs } : null;
      open = store.gesture();
      pressed = press;
      cancelsAtOpen = store.getState().ui.drag.cancels;
      const entry = clickDoor(press, buttons.button, buttons.count, buttons.modifier, factsOf(press));
      if (entry) open.dispatch(entry.command.id as CommandId, argsFor(entry, press) as never);
      // a press that lands on the edited text leaves the focus in it
      const edited = editedNode(store.getState());
      keepFocus = edited !== null && press.on === 'node' && press.node === edited;
    } else if (effect === 'drag' && machine.phase === 'dragging' && buttons?.button === 'primary') {
      const press = machine.press;
      if (press.on === 'tile') {
        // a palette tile's creation drag: nothing is dragged; the tile's entry is inserted where it is dropped. It
        // starts over the palette, outside the page: no proposal yet
        const entry = press.args.entry;
        if (typeof entry !== 'string') return;
        dragging = { dragged: [], inserting: entry, proposal: null, refusal: null, takenAt: null };
        setDrag({ dragged: [], inserting: entry, proposal: null, refusal: null, at: pointerAt });
        return;
      }
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
          dragging = { dragged, inserting: null, proposal: null, refusal: null, takenAt: null };
          setDrag({ dragged, inserting: null, proposal: null, refusal: null, at: pointerAt });
        }
      }
    } else if (effect === 'commit' || effect === 'cancel') {
      const closing = open;
      const dropped = dragging?.proposal ?? null;
      const dragged = dragging !== null;
      const press = pressed;
      open = null;
      dragging = null;
      pressed = null;
      setDrag(null);
      marquee = null;
      pressedAt = null;
      setBand(null);
      if (effect === 'commit' && press?.on === 'tile') {
        // a tile released below the threshold is its click (its door, at the selection); past it, the proposal drawn
        // last receives the tile's entry through the palette's canvas-drag door (its command refuses a parent that
        // does not accept it); with no proposal drawn (outside the page) nothing is inserted
        if (!dragged) closing?.dispatch(press.entry.command.id, { ...press.entry.door.args, ...press.args } as never);
        else if (dropped !== null && PALETTE_DRAG !== null) closing?.dispatch(PALETTE_DRAG.command.id, { ...PALETTE_DRAG.door.args, ...press.args, parent: dropped.parent, index: dropped.index } as never);
      } else if (effect === 'commit' && dropped !== null) {
        // the release commits exactly the proposal drawn last, through the door of its zone, in the gesture's transaction
        const door = dropDoor(dropped);
        if (door !== null) closing?.dispatch(door.command.id, { ...door.door.args, parent: dropped.parent, index: dropped.index } as never);
      }
      if (effect === 'commit') closing?.commit();
      else closing?.cancel();
      // the text the press left is kept whether the gesture ends or the browser takes the pointer away
      const kept = keeping;
      keeping = null;
      if (kept) store.dispatch(kept.entry.command.id as CommandId, kept.args as never);
    }
  };

  // While a drag goes on, each pointer position proposes a drop; a new proposal replaces the drawn one only once the
  // pointer is drag.hysteresis screen pixels from where the drawn one was taken. A creation drag proposes a drop only
  // over the page (the canvas overlay): over the stage around it or over a panel it proposes none (spec
  // palette-drag-insert, "Hit zones"), and it publishes every move, since its ghost follows the pointer.
  const over = (at: Point, onPage: boolean) => {
    if (dragging === null) return;
    const creation = dragging.inserting !== null;
    const next = creation && !onPage ? null : proposalAt(store.getState().document, dragging.dragged, at);
    const taken = JSON.stringify(next) !== JSON.stringify(dragging.proposal) && !(dragging.takenAt !== null && Math.hypot(at.x - dragging.takenAt.x, at.y - dragging.takenAt.y) < DRAG_HYSTERESIS);
    if (taken) {
      dragging.proposal = next;
      dragging.takenAt = at;
      // the refusal the creation drag's drop would meet there: its command's own, asked without running it
      dragging.refusal = creation && next !== null && PALETTE_DRAG !== null ? store.refusal(PALETTE_DRAG.command.id, { ...PALETTE_DRAG.door.args, entry: dragging.inserting, parent: next.parent, index: next.index } as never) : null;
    }
    if (taken || creation) setDrag({ dragged: dragging.dragged, inserting: dragging.inserting, proposal: dragging.proposal, refusal: dragging.refusal, at });
  };

  const isRoot = (node: string) => locate(store.getState().document, node as NodeId)?.parent === null;
  // A double click is the browser's own (its dblclick, after the second release, by the system's double-click time;
  // Chrome's pointerdown carries no click count, so each press is a single click): the double-click door of what it
  // lands on runs as a gesture of its own.
  const onDoubleClick = (event: MouseEvent) => {
    if (machine.phase !== 'idle' || open !== null || event.button !== 0) return;
    const press = pressAt(event, isRoot);
    if (press === null || press === 'elsewhere') return;
    const entry = clickDoor(press, 'primary', 2, modifierOf(event), factsOf(press));
    if (!entry) return;
    const gesture = store.gesture();
    gesture.dispatch(entry.command.id as CommandId, argsFor(entry, press) as never);
    gesture.commit();
  };
  // A press the pointer owner takes first takes the focus from a field of the editor (a Layers row's name being
  // renamed, spec rename-element: leaving the field keeps its name): the field keeps what it holds as it loses the
  // focus, before the press opens its gesture and runs its door, which would otherwise end the field's work first (a
  // selection elsewhere ends a rename) or find a gesture open. The text edited in place on the page is no field of the
  // editor: the frame holds that focus, and a press outside it keeps the text through its own door.
  const leaveField = () => {
    const focused = target.document.activeElement;
    if (focused instanceof HTMLElement && (focused.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName))) focused.blur();
  };
  const onDown = (event: PointerEvent) => {
    lastPress = { x: event.clientX, y: event.clientY };
    keepFocus = false;
    const press = pressAt(event, isRoot);
    if (press === null || press === 'elsewhere') return;
    if (event.button !== 0 && event.button !== 2) return;
    // a palette tile takes the primary button only
    if (press.on === 'tile' && event.button !== 0) return;
    leaveField();
    buttons = { button: event.button === 2 ? 'secondary' : 'primary', count: Math.min(Math.max(event.detail, 1), 2), modifier: modifierOf(event) };
    const at = { x: event.clientX, y: event.clientY };
    pointerAt = at;
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
    if (machine.phase === 'idle' || event.pointerId === machine.pointer) pointerAt = at;
    machine = next.machine;
    run(next.effect);
    // the gesture's drag in progress, if any: the marquee's band, or the drop proposal of an element or a tile (over
    // the page: the canvas overlay is what the pointer is on)
    if (machine.phase === 'dragging' && event.pointerId === machine.pointer) {
      drawMarquee(at);
      over(at, press !== null && press !== 'elsewhere' && press.on === 'node');
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
  // otherwise hand it to the page body right after. Nor does a press on the text edited in place: the focus stays in
  // the text.
  const onMouseDown = (event: MouseEvent) => {
    const keep = keepFocus;
    keepFocus = false;
    if (keep || (event.button === 2 && event.target instanceof Element && event.target.closest(EDITOR_MENU_AREA))) event.preventDefault();
  };

  // drag.cancel (drag-session.ts) records a cancellation in the editor state; one newer than the open gesture ends
  // it without committing (after the dispatch that recorded it returns), and the release that follows drops nothing
  const stopListening = store.subscribe(() => {
    if (open === null || store.getState().ui.drag.cancels === cancelsAtOpen) return;
    const cancelled = open;
    queueMicrotask(() => {
      if (open === cancelled) onCancel();
    });
  });

  target.addEventListener('pointerdown', onDown, true);
  target.addEventListener('dblclick', onDoubleClick, true);
  target.addEventListener('pointermove', onMove, true);
  target.addEventListener('pointerup', onUp, true);
  target.addEventListener('pointercancel', onCancel, true);
  target.addEventListener('contextmenu', onContextMenu, true);
  target.addEventListener('mousedown', onMouseDown, true);
  target.addEventListener('blur', onCancel);
  target.addEventListener('selectstart', onNative, true);
  target.addEventListener('dragstart', onNative, true);
  return () => {
    stopListening();
    onCancel();
    target.removeEventListener('pointerdown', onDown, true);
    target.removeEventListener('dblclick', onDoubleClick, true);
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
