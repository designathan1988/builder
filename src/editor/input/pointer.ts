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
// once its own door has run (spec text-edit-inline), and a press on the text toolbar over the canvas is its control's
// click, which leaves the focus in the text (spec text-inline-formatting).
//
// A primary press on a palette tile (the tile door of the command whose canvas-drag door takes a palette tile as its
// source) is a gesture too (spec palette-drag-insert, "Trigger"): released below drag.threshold it is the tile's click
// and runs the tile's door at the release; past the threshold it is a creation drag with no dragged node, which asks
// the same drop proposal and publishes it for the same drop indicator, and whose release runs the palette-drag door
// with the tile's entry and the drawn proposal's parent and index, inside the gesture: one undo step. Released where
// there is no proposal (outside the page), it inserts nothing.
//
// The keys of a drag (spec drag-level-keys-escape) run through the gesture too (keymap.ts, drag key context). Each
// drag, an element's or a tile's, is the live drag of the drag session (src/editor/drag/drag-session.ts), which gets
// the proposal the pointer makes; the proposal drawn, and dropped at the release, is the one of the level the session
// holds, redrawn as soon as a level key changes it, without a pointer move. Escape (drag.cancel) ends the gesture at
// once, its button still down: what the drag proposed is dropped with it, and the release that follows does nothing;
// what the press itself did stays (the element it selected), except for a marquee, whose band is its own selection
// and goes back to the selection held before the press (spec marquee-select); a creation drag's ghost goes back to
// the tile it came from (ghostReturn, played by the canvas chrome).
//
// A primary press on a number field's label in the inspector (the panel drag whose source is a field label, spec
// inspector-number-fields) scrubs the field from the press on, with no threshold (numberField.scrubDeadZone 0): each
// move cancels the gesture back to the value held before the press and runs the scrub door again inside a new one,
// with the text the field held at the press, the pointer's horizontal travel since the press in screen pixels and the
// key held now (the gesture number-scrub: Shift, Alt), so the field and the canvas follow the pointer live and the
// release commits the last value: one undo step. Escape (drag.cancel) cancels it back to the value before the press.
import { isFeatureBuilt } from '../../app/features.ts';
import type { Message } from '../../core/commands/registry.ts';
import { locate, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { DispatchResult, Gesture } from '../../core/store/store.ts';
import { selectionRoots } from '../../core/structure/remove.ts';
import type { CommandId, DoorId, FeatureId, KeyContextId } from '../../generated/ids.ts';
import { manifest, numberConstant, pairConstant, type DoorEntry } from '../../manifest/runtime.ts';
import { canvasFrame, flowAxis, geometryOf, nodeAt, nodeBox, nodesUnder, pageLayout, resizeBasis, screenToPage, scrollPage, sideFlow, type Point, type ResizeBasis } from '../canvas/coordinates.ts';
import { snapMode, snapMove, snapResize, snapShown } from '../canvas/snapping.ts';
import type { Box } from '../../core/geometry/snap.ts';
import { resizedBox } from '../../core/geometry/resize.ts';
import { storedValue } from '../../core/style/set.ts';
import { guidesOf } from '../../core/page/guides.ts';
import { formatColor, hsbToRgb } from '../../core/style/color.ts';
import { gradientView } from '../inspector/gradient-view.ts';
import { drawnProposal, liveDrag } from '../drag/drag-session.ts';
import { offerSide, proposeDrop, rowDrop, SIDE_DWELL, SIDE_ZONES, type DropProposal, type SideOffer } from '../drag/drop.ts';
import { MODEL_RULES, type EditorStore } from '../store.ts';
import { typedBand } from '../canvas/band-typing.ts';
import { SHADOW_EDITS } from '../canvas/handles.ts';
// a shadow handle that moves the offset (canvas/edit-handles.tsx data-shadow)
const SHADOW_OFFSET = 'offset';
import { geometryAttributes, shapeResizeFrom } from '../../core/elements/svg.ts';
import { TEXT_TOOLBAR, editArgs, editedNode, isTextElement } from '../canvas/text-edit.ts';
import { isValueControl } from '../../core/elements/inputs.ts';

const threshold = manifest.interactions.constants.find((c) => c.id === 'drag.threshold')?.value;
export const DRAG_THRESHOLD = typeof threshold === 'number' ? threshold : 4;
const hysteresis = manifest.interactions.constants.find((c) => c.id === 'drag.hysteresis')?.value;
if (typeof hysteresis !== 'number') throw new Error('interactions.json has no number drag.hysteresis');
export const DRAG_HYSTERESIS = hysteresis;
// the confirmed side drop's pill: where it is drawn from the pointer, and how near it the pointer keeps the offer
export const PILL_OFFSET = pairConstant('wrap.pillOffset');
const PILL_FREEZE = numberConstant('wrap.pillFreeze');
// autoscroll (spec drag-layout, row 8): the band along the page's visible edges, and the most it scrolls a frame
const AUTOSCROLL_ZONE = numberConstant('drop.autoscrollZone');
const AUTOSCROLL_MAX = numberConstant('drop.autoscrollMaxStep');

// What a press lands on: a node of the page (an element, or the page root where no element is), or the stage
// around the page.
// A press on the canvas chrome's label of an element is a press on that element (`label`: never a marquee).
// A press on a palette tile carries the tile's door and the arguments the tile stands for (its entry).
// A press on a number field's label carries the scrub door, the arguments the label stands for (its field's property)
// and the text the field holds at the press.
export type Press =
  | { readonly on: 'node'; readonly node: string; readonly root: boolean; readonly label?: boolean }
  | { readonly on: 'stage' }
  | { readonly on: 'tile'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>> }
  // a press on a Layers row: it selects on its click (sidebar.tsx) and arms the row's drag (spec layers-drag)
  | { readonly on: 'row'; readonly node: string }
  | { readonly on: 'scrub'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly value: string }
  // a press on a stop of the gradient bar: the stop drag's door, the arguments the stop stands for, its index and the
  // bar it moves along (spec gradient-editor)
  | { readonly on: 'stop'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly index: number; readonly bar: { readonly left: number; readonly width: number } }
  // a press on a shadow's light pad: the pad's drag door, the arguments the pad stands for (its property and layer) and
  // the pad's centre (spec shadow-editor)
  | { readonly on: 'pad'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly centre: Point; readonly element: HTMLElement }
  // a press on the quick panel's grip: its drag door, the arguments the grip stands for (the element) and the offset the
  // panel is drawn at now (spec quick-panel)
  | { readonly on: 'grip'; readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly base: Point };

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
  // whether its node is a form control whose value is edited in the inspector, never on the canvas (spec
  // elements-form-inputs-rules, Problems in Pager 1)
  readonly formControl?: boolean;
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
  if (target === 'form-control') return press.on === 'node' && !press.root && facts.formControl === true;
  // a press on a palette tile or on a field's label is no press on the canvas: it keeps no text
  if (target === OUTSIDE_EDIT) return (press.on === 'node' || press.on === 'stage' || press.on === 'row') && facts.edited !== null && !(press.on === 'node' && press.node === facts.edited);
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

// Whether Alt is held (spec hover-measure): while it is, the canvas draws the distances from the selection to the element
// under the pointer. The keymap, the owner of keys, says when it goes down and up (holdAlt); nothing changes in the
// document or the selection. Pointer state, for the canvas chrome.
let altDown = false;
const altListeners = new Set<() => void>();
export const measuring = {
  get: (): boolean => altDown,
  subscribe(listener: () => void): () => void {
    altListeners.add(listener);
    return () => altListeners.delete(listener);
  },
};
export function holdAlt(down: boolean): void {
  if (down === altDown) return;
  altDown = down;
  for (const listener of [...altListeners]) listener();
}

// Where the pointer is while it is over the canvas's stage, for the rulers' marker (spec rulers); null elsewhere.
let pointerOnStage: Point | null = null;
const pointerListeners = new Set<() => void>();
export const canvasPointer = {
  get: (): Point | null => pointerOnStage,
  subscribe(listener: () => void): () => void {
    pointerListeners.add(listener);
    return () => pointerListeners.delete(listener);
  },
};
function setCanvasPointer(at: Point | null) {
  if (at === pointerOnStage || (at !== null && pointerOnStage !== null && at.x === pointerOnStage.x && at.y === pointerOnStage.y)) return;
  pointerOnStage = at;
  for (const listener of [...pointerListeners]) listener();
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
// The free drag of positioned elements (spec absolute-free-drag): the canvas-drag door whose source is a positioned
// element, once its feature is built. A drag of a selection whose elements are all absolute or fixed (its command's
// predicate) moves them freely instead of proposing a place in the flow: each move runs the door's command with the
// travel since the last one, in page px (screen px divided by the zoom, whole px), inside the press's gesture.
const FREE_DRAG = manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.source === 'positioned-element' && isFeatureBuilt(d.door.feature as FeatureId)) ?? null;
const zoneDoor = (zone: string) => ELEMENT_DRAGS.find((d) => d.door.kind === 'canvas-drag' && d.door.zone === zone) ?? null;
const REORDER = zoneDoor('before-after');
const INTO = zoneDoor('inside');
const dropDoor = (proposal: DropProposal) => (proposal.placement === 'inside' ? INTO : REORDER);
const DRAG_MODIFIERS = new Set(manifest.interactions.gestures.find((g) => REORDER?.door.kind === 'canvas-drag' && g.id === REORDER.door.gesture)?.modifiers.map((m) => m.key) ?? []);

// The creation drags of tiles (specs palette-drag-insert, reusable-components): the canvas-drag doors of the
// palette-drag gesture that drop on a proposal, one per command (a palette tile's element.insert, a component tile's
// components.insertInstance), and the tiles they start from, that command's doors drawn as items (their clicks insert
// at the selection). A drag runs once its feature is registered as built in the feature table (src/app/features.ts);
// until then a tile's press is the tile's own click.
const TILE_DRAGS = manifest.doors.filter((d) => d.door.kind === 'canvas-drag' && d.door.gesture === 'palette-drag' && d.door.zone === 'drop-proposal');
// The drag of a Layers row (spec layers-drag): the row's own click door (which selects its node), the drop of its row
// zones and the dwell that unfolds a folded row, each only once its feature is built.
const ROW_SELECT = manifest.doors.find((d) => d.door.kind === 'panel-control' && d.door.gesture === 'layers-row-click' && (d.door.modifier ?? null) === null && d.door.button === undefined) ?? null;
const layersDrag = (zone: string) => manifest.doors.find((d) => d.door.kind === 'layers-drag' && d.door.zone === zone && isFeatureBuilt(d.door.feature as FeatureId)) ?? null;
const ROW_DROP = layersDrag('row-zones');
const ROW_DWELL = layersDrag('collapsed-row-dwell');
// how long the pointer rests on a folded row before it unfolds (interactions.json layers.expandDwell)
const EXPAND_DWELL = numberConstant('layers.expandDwell');

// The view's wheel and pan (spec zoom-wheel-pan): over the stage, the wheel runs its door by the modifier held (Ctrl
// zooms around the pointer by exp(-deltaY × zoom.wheelFactor), Shift pans across, none pans down); a drag with Space
// held, or with the middle button, pans by the pointer's travel, and Escape during it puts the view back. Space is
// the keymap's key: it tells this owner when Space goes down or up (holdSpace), and the stage shows a grab cursor
// while Space is held over it (panState).
const WHEEL_DOORS = manifest.doors.filter((d) => d.door.kind === 'canvas-wheel');
// A resize handle's drag (spec resize-handles): the chrome draws the handles of the resize gesture's doors on the one
// selected element; a press on one, moved past the drag threshold, opens a gesture whose geometry.resize runs on every
// move with the size the travel gives (the page shows it live, the history keeps one step), Shift keeping the ratio and
// Alt resizing from the centre as the move reads them; the release commits it and Escape (drag.cancel) drops it.
const RESIZE_MIN = numberConstant('resize.minBox');
// The rotation handle (spec rotation-handle): its drag writes the property its door writes (rotate) as the pointer's angle
// around the element's centre, from the angle it held, in whole degrees; Shift snaps it to rotate.snapStep.
const ROTATE_SNAP = numberConstant('rotate.snapStep');
// The guide drags (spec guides-manual): out of a ruler (data-ruler: the axis of the guides it makes) a new guide, once
// the pointer has moved past drag.threshold; a guide (data-guide) moved over the page; either released over its own
// ruler is no guide: a new one is not made, a moved one is deleted, through the door of that zone. One gesture each.
const guideDoor = (source: string, zone: string) => manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.source === source && d.door.zone === zone && isFeatureBuilt(d.door.feature as FeatureId)) ?? null;
const GUIDE_CREATES: Readonly<Record<string, DoorEntry | null>> = { horizontal: guideDoor('top-ruler', 'page'), vertical: guideDoor('left-ruler', 'page') };
const GUIDE_MOVE = guideDoor('guide', 'page');
const GUIDE_DELETE = guideDoor('guide', 'own-ruler');
// the ruler a guide being dragged is over, its own (the chrome's delete hint), or null
let guideOnRuler: string | null = null;
const guideRulerListeners = new Set<() => void>();
export const guideOverRuler = {
  get: (): string | null => guideOnRuler,
  subscribe(listener: () => void): () => void {
    guideRulerListeners.add(listener);
    return () => guideRulerListeners.delete(listener);
  },
};
function setGuideOnRuler(axis: string | null): void {
  if (axis === guideOnRuler) return;
  guideOnRuler = axis;
  for (const listener of [...guideRulerListeners]) listener();
}
// an angle as degrees: deg, rad, grad or turn, else none
function degreesOf(value: string | undefined): number {
  const match = value === undefined ? null : /^(-?\d*\.?\d+)(deg|rad|grad|turn)$/.exec(value.trim());
  if (match === null) return 0;
  const n = Number(match[1]);
  const per: Readonly<Record<string, number>> = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };
  return n * (per[match[2] ?? ''] ?? 1);
}
// an angle folded into -180 to 180 degrees
const folded = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;
// An Edit on canvas handle's drag (spec spacing-handles, radius-border-gap-handles): the chrome draws the handles of the
// mode (canvas/edit-handles.tsx), each saying what its drag starts from, which way on the screen grows it and which
// argument of its command the value goes in; a press on one, moved past the drag threshold, opens a gesture whose
// command runs on every move with the new value (its start plus the travel along its normal ÷ the zoom, whole CSS px,
// never below its minimum); for a spacing band Shift writes all four sides and Alt the opposite side by the same amount
// (the gesture spacing-band of interactions.json). The release commits it, one undo step, and Escape (drag.cancel)
// drops it. A spacing band pressed and released without a drag opens its typed field (canvas/band-typing.ts); any other
// handle takes the focus, for its arrows (handle.step).
interface SpacingDrag {
  readonly entry: DoorEntry;
  readonly args: Readonly<Record<string, string>>;
  readonly valueArg: string;
  readonly element: HTMLElement;
  readonly start: number;
  readonly normal: readonly [number, number];
  readonly min: number | null;
  readonly opposite: string;
  readonly oppositeStart: number;
  readonly pointer: number;
  readonly from: Point;
  readonly zoom: number;
  // a shadow handle: the property it edits, whether it moves the offset (else the blur), and the layer's X and Y
  readonly shadow: { readonly property: string; readonly offset: boolean; readonly x: number; readonly y: number } | null;
  gesture: Gesture | null;
  cancels: number;
}
const MODIFIER_MEANINGS = new Map((manifest.interactions.gestures.find((g) => g.id === 'spacing-band')?.modifiers ?? []).map((m) => [m.meaning, m.key] as const));
const ALL_SIDES_KEY = MODIFIER_MEANINGS.get('change-all-four-sides');
const OPPOSITE_KEY = MODIFIER_MEANINGS.get('change-opposite-side');
const ALL_SIDES = 'all';
// Whether a drawn handle stands on its corner or edge centre of the element's box now (screen px, within a pixel): its
// hit area lies outside the box on its sides, so its anchor is its edge next to the box, or its middle across.
function handleInPlace(handle: Element, box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean {
  const drawn = handle.getBoundingClientRect();
  const side = (handle.getAttribute('data-resize-handle') ?? '').split('-').pop() ?? '';
  const anchorX = side.includes('w') ? drawn.right : side.includes('e') ? drawn.left : drawn.left + drawn.width / 2;
  const anchorY = side.includes('n') ? drawn.bottom : side.includes('s') ? drawn.top : drawn.top + drawn.height / 2;
  const wantX = side.includes('w') ? box.x : side.includes('e') ? box.x + box.width : box.x + box.width / 2;
  const wantY = side.includes('n') ? box.y : side.includes('s') ? box.y + box.height : box.y + box.height / 2;
  return Math.abs(anchorX - wantX) <= 1 && Math.abs(anchorY - wantY) <= 1;
}
const PAN_DRAGS = manifest.doors.filter((d) => d.door.kind === 'canvas-drag' && d.door.gesture === 'space-pan');
const WHEEL_FACTOR = numberConstant('zoom.wheelFactor');
// a wheel's line (deltaMode 1) in screen px, as the spec measured it
const WHEEL_LINE = 16;
const panDrag = (source: string): DoorEntry | null => PAN_DRAGS.find((d) => d.door.kind === 'canvas-drag' && d.door.source === source) ?? null;
const onStage = (target: EventTarget | null): boolean => target instanceof Element && target.closest('[data-canvas-stage]') !== null;
export type PanView = 'idle' | 'armed' | 'panning';
let panView: PanView = 'idle';
let spaceDown = false;
let overStage = false;
let panning: { pointer: number; last: Point; moved: Point; entry: DoorEntry } | null = null;
let panDispatch: ((entry: DoorEntry, args: Readonly<Record<string, unknown>>) => void) | null = null;
const panListeners = new Set<() => void>();
function setPanView(view: PanView): void {
  if (view === panView) return;
  panView = view;
  for (const listener of panListeners) listener();
}
export const panState = {
  get: (): PanView => panView,
  subscribe: (listener: () => void): (() => void) => {
    panListeners.add(listener);
    return () => panListeners.delete(listener);
  },
};
// Space went down or up (the keymap, which owns the keys): held over the stage it arms the pan; true when it did
export function holdSpace(down: boolean): boolean {
  if (!down) {
    spaceDown = false;
    if (panning === null) setPanView('idle');
    return false;
  }
  if (!overStage && panning === null) return false;
  spaceDown = true;
  if (panning === null) setPanView('armed');
  return true;
}
// Escape during a pan puts the view back where the pan began; true when a pan was cancelled
export function cancelPan(): boolean {
  if (panning === null) return false;
  const { entry, moved } = panning;
  panning = null;
  if (moved.x !== 0 || moved.y !== 0) panDispatch?.(entry, { dx: -moved.x, dy: -moved.y });
  setPanView(spaceDown ? 'armed' : 'idle');
  return true;
}
// the creation drag a tile starts: its command's drop door, while its feature is built; null for any other control
const tileDrag = (entry: DoorEntry): DoorEntry | null =>
  entry.door.kind === 'panel-control' && entry.door.drawnAs === 'item' ? (TILE_DRAGS.find((d) => d.command.id === entry.command.id && isFeatureBuilt(d.door.feature as FeatureId)) ?? null) : null;
// The side drop (spec drag-layout, row 5): the canvas-drag doors of the side band, one for an element drag and one for
// a tile's creation drag; a door whose feature is not built offers nothing.
const sideDoor = (source: string) => manifest.doors.find((d) => d.door.kind === 'canvas-drag' && d.door.zone === 'side-band' && d.door.source === source && isFeatureBuilt(d.door.feature as FeatureId)) ?? null;
const SIDE_ELEMENT = sideDoor('canvas-element');
const SIDE_TILE = sideDoor('palette-tile');
const isTile = (entry: DoorEntry) => tileDrag(entry) !== null;
// The side drop of a creation drag: the side band's door, when its command takes what the tile stands for (a palette
// entry: element.wrapBeside); a component's tile offers none.
const sideTileFor = (inserting: Inserting): DoorEntry | null => (SIDE_TILE !== null && Object.keys(inserting.args).every((name) => name in SIDE_TILE.command.args) ? SIDE_TILE : null);
// The scrub of a number field (spec inspector-number-fields): the panel drag doors pressed on a field's label, and the
// key held now when their gesture gives it a meaning (interactions.json number-scrub) and their command takes it.
const SCRUBS = manifest.doors.filter((d) => d.door.kind === 'panel-drag' && d.door.source === 'field-label');
// the drag of a gradient stop along its bar (spec gradient-editor): the panel drag pressed on a stop
const STOP_DRAGS = manifest.doors.filter((d) => d.door.kind === 'panel-drag' && d.door.source === 'gradient-stop');
// the drag of a shadow's light on its pad (spec shadow-editor): the panel drags pressed on a light pad
const PAD_DRAGS = manifest.doors.filter((d) => d.door.kind === 'panel-drag' && d.door.gesture === 'shadow-pad-drag');
// The quick panel's grip (spec quick-panel): the panel drag doors pressed on it.
const GRIP_DRAGS = manifest.doors.filter((d) => d.door.kind === 'panel-drag' && d.door.source === 'quick-panel-grip');
function scrubModifier(entry: DoorEntry, modifier: string | null): string | null {
  const gesture = manifest.interactions.gestures.find((g) => entry.door.kind === 'panel-drag' && g.id === entry.door.gesture);
  return modifier !== null && 'modifier' in entry.command.args && gesture?.modifiers.some((m) => m.key === modifier) === true ? modifier : null;
}

// Whether the pointer owner runs the presses of a drawn control (a palette tile): its click then comes from here, and
// the control's own onClick runs only an activation with no press (assistive technology's, or a key's).
export function pressedByPointer(entry: DoorEntry): boolean {
  return isTile(entry);
}

// The drag in progress, for the canvas chrome: the nodes dragged, or, for a palette tile's creation drag, none and
// the palette entry it inserts; the drop proposal drawn now (the one a release commits) and, for a creation drag, the
// refusal its drop would meet there (the command's own, store.refusal: a parent that does not accept the element,
// spec palette-drag-insert, Problems in Pager 3); the receiver levels the drawn proposal climbed above the pointer's
// own (the drag session's level keys); and where the pointer is on the screen (the ghost of a creation drag follows
// it). Pointer state, not editor state: nothing changes until the release.
// What a creation drag inserts: the tile pressed, the arguments it stands for (a palette entry: {entry}; a component:
// {component}) and the canvas-drag door that drops it where the proposal says.
export interface Inserting {
  readonly tile: DoorEntry;
  readonly args: Readonly<Record<string, unknown>>;
  readonly drop: DoorEntry;
}

export interface DragView {
  readonly dragged: readonly NodeId[];
  readonly inserting: Inserting | null;
  readonly proposal: DropProposal | null;
  readonly refusal: Message | null;
  readonly levels: number;
  readonly at: Point;
  // the side drop offered where the pointer is (spec drag-layout, row 5): confirmed once the pointer stayed
  // wrap.sideDwell in its band (then its pill is drawn where it was confirmed, and a release wraps), else only offered
  // (a release is the ordinary drop the proposal draws); with the refusal its wrap would meet
  readonly side: SideView | null;
}
export interface SideView {
  readonly offer: SideOffer;
  readonly armed: boolean;
  readonly pill: Point | null;
  readonly refusal: Message | null;
}
// The elements a drop has just placed, for the canvas chrome, which flashes them (spec drag-layout, row 10); numbered,
// so the same elements dropped again flash again.
export interface Dropped {
  readonly id: number;
  readonly nodes: readonly NodeId[];
}
let dropped: Dropped | null = null;
let drops = 0;
const droppedListeners = new Set<() => void>();
export const lastDrop = {
  get: (): Dropped | null => dropped,
  subscribe(listener: () => void): () => void {
    droppedListeners.add(listener);
    return () => droppedListeners.delete(listener);
  },
};
function setDropped(nodes: readonly NodeId[]) {
  drops += 1;
  dropped = { id: drops, nodes };
  for (const listener of [...droppedListeners]) listener();
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

// The ghost of a creation drag Escape cancelled, for the canvas chrome, which plays its way back (spec
// drag-level-keys-escape, Problems in Pager 4): the palette entry, where the pointer was and where the press went down
// on the tile, on the screen; each one numbered, so a new one plays anew. Pointer state: the next press takes it away.
export interface GhostReturn {
  readonly id: number;
  readonly inserting: Inserting;
  readonly from: Point;
  readonly to: Point;
}
let returningGhost: GhostReturn | null = null;
let ghostReturns = 0;
const returnListeners = new Set<() => void>();
export const ghostReturn = {
  get: (): GhostReturn | null => returningGhost,
  subscribe(listener: () => void): () => void {
    returnListeners.add(listener);
    return () => returnListeners.delete(listener);
  },
};
function setGhostReturn(next: Omit<GhostReturn, 'id'> | null) {
  if (next === null && returningGhost === null) return;
  if (next !== null) ghostReturns += 1;
  returningGhost = next === null ? null : { id: ghostReturns, ...next };
  for (const listener of [...returnListeners]) listener();
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

// Whether a pointer position still lies by the side of the element a side drop was offered for: within its box and
// its side strip, both widened by wrap.sideEdgeExclusion, and never needing the clearance from its other edges.
function keepsSide(offer: SideOffer, at: Point): boolean {
  const frame = canvasFrame();
  const b = frame ? nodeBox(frame, offer.target) : null;
  if (!b) return false;
  const m = SIDE_ZONES.edgeExclusion;
  if (at.x < b.x - m || at.x > b.x + b.width + m || at.y < b.y - m || at.y > b.y + b.height + m) return false;
  const across = offer.wrapper === 'row' ? b.width : b.height;
  const pos = offer.wrapper === 'row' ? at.x - b.x : at.y - b.y;
  const band = Math.min(SIDE_ZONES.bandMax, SIDE_ZONES.bandFraction * across);
  return offer.side === 'before' ? pos <= band + m : pos >= across - band - m;
}

// whether a node lies inside another (below it in the tree)
function isInside(document: DocumentJson, node: NodeId, ancestor: NodeId): boolean {
  for (let at = locate(document, node)?.parent ?? null; at !== null; at = locate(document, at.id)?.parent ?? null) if (at.id === ancestor) return true;
  return false;
}

// The Layers row under a pointer position, where the pointer is down it (a fraction of its height) and whether its
// branch is folded; null off the rows.
function rowUnder(at: Point): { readonly node: NodeId; readonly at: number; readonly folded: boolean } | null {
  if (ROW_SELECT === null) return null;
  const row = document.elementFromPoint(at.x, at.y)?.closest(`[data-door="${ROW_SELECT.ref}"]`);
  if (!row) return null;
  const stands: unknown = JSON.parse(row.getAttribute('data-args') ?? '{}');
  const node = stands !== null && typeof stands === 'object' ? (stands as Record<string, unknown>).target : undefined;
  if (typeof node !== 'string') return null;
  const box = row.getBoundingClientRect();
  return { node: node as NodeId, at: box.height > 0 ? (at.y - box.top) / box.height : 0.5, folded: row.getAttribute('aria-expanded') === 'false' };
}

// The side drop a pointer position offers now, measured on the page.
function sideAt(document: DocumentJson, dragged: readonly NodeId[], at: Point): SideOffer | null {
  const frame = canvasFrame();
  if (!frame) return null;
  return offerSide(document, dragged, nodesUnder(frame, at), at, { box: (id) => nodeBox(frame, id), flow: (id) => sideFlow(frame, id) });
}

// While a gesture is open the keys belong to it: they are read in the drag key context and their doors run through
// the gesture's transaction (keymap.ts).
let open: Gesture | null = null;
export function openGesture(): { readonly context: KeyContextId; readonly gesture: Gesture } | null {
  if (open === null) return null;
  return { context: session !== null && open === session ? COLOR_PICKER_CONTEXT : 'drag', gesture: open };
}

// The colour picker's session (spec color-picker; its state: src/editor/inspector/color-picker.ts): one gesture opened
// when the picker opens, through which every part of the picker writes (dispatchInSession); the picker's Apply
// commits it, its Cancel, Escape (drag.cancel, in the picker's own key context) or its closing otherwise cancels it.
// A press on the picker's area (saturation across, brightness down) writes the colour it points at, and so does every
// move while the button is held.
const COLOR_PICKER_CONTEXT: KeyContextId = 'color-picker';
// the picker's own cancel, run when Escape ends its session: the command of its Cancel button
const CANCEL_PICKER = (manifest.doors.find((d) => d.door.kind === 'panel-control' && d.door.panel === 'color-picker' && d.door.control === 'cancel')?.command.id ?? '') as CommandId;
let session: Gesture | null = null;
let sessionDispatch: ((id: CommandId, args: unknown) => DispatchResult) | null = null;
export function dispatchInSession(id: CommandId, args: unknown): DispatchResult | null {
  return sessionDispatch === null ? null : sessionDispatch(id, args);
}

// Runs a dispatch of its own once no gesture is open: at once, or, when a press opened one before a field lost the
// focus (a click elsewhere), once that gesture ends, since a command recorded once per dispatch never joins a gesture.
// A field keeps what was typed this way when it is left (the inspector's text field, a number field).
export function afterGesture(run: () => void): void {
  if (open === null) {
    run();
    return;
  }
  const wait = () => (open === null ? run() : requestAnimationFrame(wait));
  requestAnimationFrame(wait);
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

// The text toolbar over the canvas while a text is edited (text-toolbar.tsx): its controls run their own doors, so a
// press there is no press on the page under it, and it leaves the focus in the edited text (spec
// text-inline-formatting: Bold, Italic and Link act on what is selected there).
const TEXT_TOOLBAR_AREA = `[data-canvas-overlay] [data-region="${TEXT_TOOLBAR}"]`;
const onTextToolbar = (target: EventTarget | null) => target instanceof Element && target.closest(TEXT_TOOLBAR_AREA) !== null;

// What a pointer event is on: the label of an element on the canvas chrome (spec select-click, "Hit zones": the
// selection label and the hover label select or drag the element they name), the page under the overlay, the
// stage, or neither (the rest of the editor, and the text toolbar drawn over the canvas).
function pressAt(event: MouseEvent, isRoot: (node: string) => boolean): Press | null | 'elsewhere' {
  const target = event.target instanceof Element ? event.target : null;
  if (onTextToolbar(target)) return 'elsewhere';
  const named = target?.closest('[data-canvas-overlay] [data-label-for]')?.getAttribute('data-label-for') ?? null;
  if (named !== null) return { on: 'node', node: named, root: isRoot(named), label: true };
  if (target?.closest('[data-canvas-overlay]')) {
    const frame = canvasFrame();
    const hit = frame ? nodeAt(frame, { x: event.clientX, y: event.clientY }) : null;
    return hit === null ? null : { on: 'node', node: hit.node, root: hit.root };
  }
  if (target?.hasAttribute('data-canvas-stage')) return { on: 'stage' };
  // a Layers row, pressed on itself or its name (not on its caret, eye, lock or name field) with no key held
  const row = ROW_DROP !== null && ROW_SELECT !== null ? target?.closest(`[data-door="${ROW_SELECT.ref}"]`) : null;
  if (row && !target?.closest('button, input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]') && modifierOf(event) === null) {
    const stands: unknown = JSON.parse(row.getAttribute('data-args') ?? '{}');
    const node = stands !== null && typeof stands === 'object' ? (stands as Record<string, unknown>).target : undefined;
    if (typeof node === 'string') return { on: 'row', node };
  }
  // a palette tile that is available (a tile of a feature not built yet is drawn disabled and takes no press), or a
  // number field's label that is (its field's feature registered): the text its field holds is read now, at the press
  const control = target?.closest('[data-door]');
  const entry = manifest.doorByRef.get((control?.getAttribute('data-door') ?? '') as DoorId);
  if (control instanceof HTMLElement && entry && PAD_DRAGS.includes(entry) && control.getAttribute('aria-disabled') !== 'true') {
    const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    const box = control.getBoundingClientRect();
    // the centre on the pixel grid, so a press on the drawn centre puts the light at 0, 0
    return { on: 'pad', entry, args: args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {}, centre: { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }, element: control };
  }
  if (control instanceof HTMLElement && entry && GRIP_DRAGS.includes(entry) && control.getAttribute('aria-disabled') !== 'true') {
    const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    const base: unknown = JSON.parse(control.getAttribute('data-offset') ?? '{}');
    const { x, y } = (base ?? {}) as Record<string, unknown>;
    if (typeof x === 'number' && typeof y === 'number') return { on: 'grip', entry, args: args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {}, base: { x, y } };
  }
  if (control && entry && STOP_DRAGS.includes(entry) && control.getAttribute('aria-disabled') !== 'true') {
    const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    const stands = args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
    const edit = stands.edit !== null && typeof stands.edit === 'object' ? (stands.edit as Record<string, unknown>) : {};
    const bar = control.closest('[data-gradient-bar]')?.getBoundingClientRect();
    if (typeof edit.stop === 'number' && bar && bar.width > 0) return { on: 'stop', entry, args: stands, index: edit.stop, bar: { left: bar.left, width: bar.width } };
  }
  if (control && entry && SCRUBS.includes(entry) && control.getAttribute('aria-disabled') !== 'true') {
    const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    const input = control.closest('[data-number-field]')?.querySelector('input');
    return { on: 'scrub', entry, args: args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {}, value: input?.value ?? '' };
  }
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
  // inserts (a tile's), the pointer's own proposal (level 0) and where the pointer was when it was taken
  // (drag.hysteresis), and the proposal drawn at the drag session's level, the levels it climbed and the refusal its
  // drop would meet (a creation drag's)
  let dragging: {
    readonly dragged: readonly NodeId[];
    readonly inserting: Inserting | null;
    base: DropProposal | null;
    takenAt: Point | null;
    proposal: DropProposal | null;
    levels: number;
    refusal: Message | null;
    // the side drop offered, whether the dwell confirmed it, where its pill is drawn and the refusal its wrap would meet
    side: { offer: SideOffer; armed: boolean; pill: Point | null; refusal: Message | null } | null;
    // whether the pointer's proposal came from a Layers row (its release runs the row drop's door)
    fromRow: boolean;
    // the folded row the pointer rests on, and the timer that unfolds it
    resting: string | null;
  } | null = null;
  let unfold: ReturnType<typeof setTimeout> | null = null;
  // the colour picker's area held with the pointer
  let pickingColor: { area: HTMLElement; pointer: number } | null = null;
  // the colour at a point of the area: the hue and alpha it shows (data-hue, data-alpha), the saturation across and the
  // brightness down, written with the area's door (style.set) for its property through the session
  const pickColor = (area: HTMLElement, x: number, y: number) => {
    const box = area.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || session === null) return;
    const s = Math.min(1, Math.max(0, (x - box.left) / box.width));
    const v = 1 - Math.min(1, Math.max(0, (y - box.top) / box.height));
    const value = formatColor(hsbToRgb({ h: Number(area.dataset.hue ?? '0'), s, v, a: Number(area.dataset.alpha ?? '1') }));
    const entry = manifest.doorByRef.get((area.getAttribute('data-door') ?? '') as DoorId);
    if (!entry) return;
    session.dispatch(entry.command.id as CommandId, { ...entry.door.args, property: area.dataset.property ?? '', value } as never);
  };
  // the resize handle pressed: its door and handle, where it went down, what the element measured then and the zoom,
  // and the gesture its drag opened (none before the threshold) with the cancellations counted when it opened
  // a resize: its handle, where it began, its basis, the zoom, and the resized node and its box then (page px), which the
  // snapping reads
  let resizing: { entry: DoorEntry; handle: string; pointer: number; start: Point; basis: ResizeBasis; zoom: number; gesture: Gesture | null; cancels: number; node: NodeId; box: Box | null } | null = null;
  // a rotation in progress: its handle's door, the element's centre and the pointer's angle around it at the press, the
  // angle the element held, and its gesture once the pointer moved past the threshold
  // a guide drag in progress: a new guide out of a ruler or a guide moved, its axis, the guide once there is one, and its
  // gesture once the pointer moved past the threshold
  let guiding: { kind: 'create' | 'move'; axis: string; guide: string | null; pointer: number; start: Point; gesture: Gesture | null; cancels: number } | null = null;
  let rotating: { entry: DoorEntry; property: string; pointer: number; start: Point; centre: Point; startAngle: number; base: number; gesture: Gesture | null; cancels: number } | null = null;
  let spacing: SpacingDrag | null = null;
  // the timer that confirms the side drop offered after wrap.sideDwell, and the frame loop of the autoscroll
  let dwell: ReturnType<typeof setTimeout> | null = null;
  let scrolling = 0;
  // whether the pointer has been inside the page's visible box since the drag began, far enough from its edges: the
  // autoscroll waits for it, so a drag that starts at an edge does not scroll at once (spec drag-layout, Problems 3)
  let insideOnce = false;
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
  // a free drag in progress: where it started on the screen, the zoom then, and the travel already run (page px)
  // a free drag: where it began, the zoom, the travel already run, and the moved node and its box then (page px), which
  // the snapping reads
  let freeing: { start: Point; zoom: number; applied: Point; node: NodeId | null; box: Box | null } | null = null;
  // whether the press just handled leaves the focus where it is: in the text edited in place, which the press
  // started or landed on (the browser would otherwise move the focus to the editor's page body at the mousedown)
  let keepFocus = false;
  // the door that keeps the text a press outside it left, with the edit's arguments, run once the gesture closes
  let keeping: { entry: DoorEntry; args: Record<string, unknown> } | null = null;
  // the scrub of a number field's label: its press, and where the pointer went down on the screen
  let scrubbing: { readonly press: Extract<Press, { on: 'scrub' }>; readonly startX: number } | null = null;
  // the drag of a shadow's light: its press, and where the pointer went down on the screen
  let lighting: { readonly press: Extract<Press, { on: 'pad' }>; readonly startX: number } | null = null;
  // The light follows the pointer from the press on: X and Y are the pointer's offset from the pad's centre, whole
  // pixels, set anew at every move (the gesture cancelled back to the shadow before the press and opened again); the
  // release keeps them, one undo step; Escape puts them back.
  const moveLight = (at: Point) => {
    if (lighting === null) return;
    const { press, startX } = lighting;
    open?.cancel();
    open = store.gesture();
    const edit = { ...(press.args.edit as Record<string, unknown>), x: `${Math.round(at.x - press.centre.x)}px`, y: `${Math.round(at.y - press.centre.y)}px` };
    open.dispatch(press.entry.command.id as CommandId, { ...press.entry.door.args, ...press.args, edit, distance: at.x - startX } as never);
  };
  // the drag of the quick panel by its grip: its press, and where the pointer went down on the screen
  let gripping: { readonly press: Extract<Press, { on: 'grip' }>; readonly start: Point } | null = null;
  // The panel follows the pointer from the press on: its offset from its element is the one it was drawn at plus the
  // pointer's travel, set anew at every move (the gesture cancelled back and opened again); the release keeps it (not
  // an undo step); Escape puts it back.
  const moveGrip = (at: Point) => {
    if (gripping === null) return;
    const { press, start } = gripping;
    open?.cancel();
    open = store.gesture();
    open.dispatch(press.entry.command.id as CommandId, { ...press.entry.door.args, ...press.args, offset: { x: press.base.x + at.x - start.x, y: press.base.y + at.y - start.y }, distance: at.x - start.x } as never);
  };
  // the drag of a gradient stop: its press, and where the pointer went down on the screen
  let stopping: { readonly press: Extract<Press, { on: 'stop' }>; readonly startX: number } | null = null;
  // The stop follows the pointer along its bar from the press on: every move sets its position anew (the gesture
  // cancelled back to the gradient before the press and opened again), a whole per cent from 0 to 100; the release
  // keeps it, one undo step; Escape puts it back.
  const moveStop = (at: Point) => {
    if (stopping === null) return;
    const { press, startX } = stopping;
    const position = Math.round(Math.min(100, Math.max(0, ((at.x - press.bar.left) / press.bar.width) * 100)));
    open?.cancel();
    open = store.gesture();
    const edit = { ...(press.args.edit as Record<string, unknown>), stop: press.index, position };
    open.dispatch(press.entry.command.id as CommandId, { ...press.entry.door.args, ...press.args, edit, distance: at.x - startX } as never);
  };

  // The scrub follows the pointer: every move scrubs anew from the value held before the press, so the gesture is
  // cancelled (back to that value) and opened again with the pointer's travel and the key held now.
  const scrub = (at: Point, modifier: string | null) => {
    if (scrubbing === null) return;
    const { press, startX } = scrubbing;
    const held = scrubModifier(press.entry, modifier);
    open?.cancel();
    open = store.gesture();
    open.dispatch(press.entry.command.id as CommandId, { ...press.entry.door.args, ...press.args, value: press.value, distance: at.x - startX, ...(held !== null ? { modifier: held } : {}) } as never);
  };

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
    const formControl = press.on === 'node' && isValueControl(state.document, press.node);
    return { textual: press.on === 'node' && !formControl && isTextElement(state.document, press.node), edited: editedNode(state), formControl };
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
      // a press on a field's label starts its scrub, which the moves run
      if (press.on === 'scrub') scrubbing = { press, startX: machine.start.x };
      // a press on a gradient stop chooses it (the editor's fields edit it) and starts its drag, which the moves run
      if (press.on === 'stop') {
        stopping = { press, startX: machine.start.x };
        gradientView.chooseStop(press.index);
      }
      // a press on a light pad puts the light where it lands, and the moves drag it; the pad takes the focus (its keys)
      // a press on the quick panel's grip starts its drag, which the moves run
      if (press.on === 'grip') gripping = { press, start: machine.start };
      if (press.on === 'pad') {
        lighting = { press, startX: machine.start.x };
        press.element.focus();
        moveLight(machine.start);
      }
    } else if (effect === 'drag' && machine.phase === 'dragging' && buttons?.button === 'primary') {
      const press = machine.press;
      if (press.on === 'tile') {
        // a tile's creation drag: nothing is dragged; what the tile stands for is inserted where it is dropped. It
        // starts over the palette, outside the page: no proposal yet
        const drop = tileDrag(press.entry);
        if (drop === null) return;
        const inserting: Inserting = { tile: press.entry, args: press.args, drop };
        dragging = { dragged: [], inserting, base: null, takenAt: null, proposal: null, levels: 0, refusal: null, side: null, fromRow: false, resting: null };
        liveDrag.begin([]);
        setDrag({ dragged: [], inserting, proposal: null, refusal: null, levels: 0, at: pointerAt, side: null });
        return;
      }
      if (press.on === 'row') {
        if (ROW_SELECT === null || ROW_DROP === null) return;
        if (!store.getState().selection.includes(press.node as NodeId)) open?.dispatch(ROW_SELECT.command.id as CommandId, { ...ROW_SELECT.door.args, target: press.node } as never);
        const state = store.getState();
        const roots = selectionRoots(state.document, state.selection);
        // the page root's row is never dragged
        if (roots.length === 0 || roots.some((at) => at.parent === null)) return;
        const dragged = roots.map((at) => at.node.id);
        dragging = { dragged, inserting: null, base: null, takenAt: null, proposal: null, levels: 0, refusal: null, side: null, fromRow: false, resting: null };
        liveDrag.begin(dragged);
        setDrag({ dragged, inserting: null, proposal: null, refusal: null, levels: 0, at: pointerAt, side: null });
        return;
      }
      const node = press.on === 'node' ? (locate(store.getState().document, press.node as NodeId)?.node ?? null) : null;
      // a press on the empty area of the page or of a container with children becomes a marquee; what the press's
      // click did is undone, so the marquee starts from the selection held before the press
      const mode = MARQUEE === null ? null : marqueeMode(MARQUEE, press, buttons.modifier, node);
      const plain = buttons.modifier === null || DRAG_MODIFIERS.has(buttons.modifier as never);
      const frame = canvasFrame();
      const zoom = frame ? geometryOf(frame)?.zoom : undefined;
      if (MARQUEE !== null && mode !== null) marquee = { entry: MARQUEE, mode };
      else if (FREE_DRAG !== null && press.on === 'node' && !press.root && zoom !== undefined && positionedNow()) {
        const moved = store.getState().selection[0] ?? null;
        freeing = { start: machine.start, zoom, applied: { x: 0, y: 0 }, node: moved, box: moved === null ? null : pageLayout.box(moved) };
      }
      else if (ELEMENT_DRAGS.length > 0 && press.on === 'node' && !press.root && plain) {
        // any other press on an element drags the selection's roots, which the press has just made that element
        const state = store.getState();
        const dragged = selectionRoots(state.document, state.selection).map((at) => at.node.id);
        if (dragged.length > 0) {
          dragging = { dragged, inserting: null, base: null, takenAt: null, proposal: null, levels: 0, refusal: null, side: null, fromRow: false, resting: null };
          liveDrag.begin(dragged);
          setDrag({ dragged, inserting: null, proposal: null, refusal: null, levels: 0, at: pointerAt, side: null });
        }
      }
    } else if (effect === 'commit' || effect === 'cancel') {
      const closing = open;
      const dropped = dragging?.proposal ?? null;
      const dragged = dragging !== null;
      const side = dragging?.side?.armed === true && dragging.fromRow === false ? dragging.side : null;
      const fromRow = dragging?.fromRow === true;
      // a creation drag's doors: where it drops, and its side drop (a palette tile's only)
      const inserting = dragging?.inserting ?? null;
      const dropDoorOf = inserting?.drop ?? null;
      const sideDoorOf = inserting === null ? null : sideTileFor(inserting);
      // the document before the release, to tell whether the drop placed anything
      const before = store.getState().document;
      stopDragTimers();
      const press = pressed;
      open = null;
      dragging = null;
      freeing = null;
      snapShown.set(null);
      liveDrag.end();
      scrubbing = null;
      stopping = null;
      lighting = null;
      gripping = null;
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
        else if (side !== null && sideDoorOf !== null) closing?.dispatch(sideDoorOf.command.id, { ...sideDoorOf.door.args, ...press.args, target: side.offer.target, side: side.offer.side, wrapper: side.offer.wrapper } as never);
        else if (dropped !== null && dropDoorOf !== null) closing?.dispatch(dropDoorOf.command.id, { ...dropDoorOf.door.args, ...press.args, parent: dropped.parent, index: dropped.index } as never);
      } else if (effect === 'commit' && dragged && side !== null && SIDE_ELEMENT !== null) {
        // a confirmed side drop puts the dragged elements beside its target in a new wrapper
        closing?.dispatch(SIDE_ELEMENT.command.id, { ...SIDE_ELEMENT.door.args, target: side.offer.target, side: side.offer.side, wrapper: side.offer.wrapper } as never);
      } else if (effect === 'commit' && dropped !== null) {
        // the release commits exactly the proposal drawn last, through the door of its zone (a Layers row's, when it came
        // from a row), in the gesture's transaction
        const door = fromRow ? ROW_DROP : dropDoor(dropped);
        if (door !== null) closing?.dispatch(door.command.id, { ...door.door.args, parent: dropped.parent, index: dropped.index } as never);
      }
      if (effect === 'commit') closing?.commit();
      else closing?.cancel();
      // what a drop placed flashes (spec drag-layout, row 10): the selection it left, when the document changed
      if (effect === 'commit' && dragged && store.getState().document !== before) setDropped(store.getState().selection);
      // the text the press left is kept whether the gesture ends or the browser takes the pointer away
      const kept = keeping;
      keeping = null;
      if (kept) store.dispatch(kept.entry.command.id as CommandId, kept.args as never);
    }
  };

  // The proposal drawn, and dropped at the release: the pointer's own at the level the drag session holds (its level
  // keys, drag-session.ts), and, for a creation drag, the refusal its drop would meet there. It is published when it
  // changes, whether the pointer or a level key changed it (a level key redraws it at once, without a pointer move),
  // and on every move of a creation drag, whose ghost follows the pointer.
  const redraw = (at: Point, publish: boolean) => {
    const live = liveDrag.get();
    if (dragging === null || live === null) return;
    const state = store.getState();
    const { proposal, level } = drawnProposal(state.ui.drag, live, state.document);
    const changed = level !== dragging.levels || JSON.stringify(proposal) !== JSON.stringify(dragging.proposal);
    if (changed) {
      dragging.proposal = proposal;
      dragging.levels = level;
      // the refusal the creation drag's drop would meet there: its command's own, asked without running it
      dragging.refusal =
        dragging.inserting !== null && proposal !== null
          ? store.refusal(dragging.inserting.drop.command.id, { ...dragging.inserting.drop.door.args, ...dragging.inserting.args, parent: proposal.parent, index: proposal.index } as never)
          : null;
    }
    if (changed || publish) setDrag({ dragged: dragging.dragged, inserting: dragging.inserting, proposal: dragging.proposal, refusal: dragging.refusal, levels: dragging.levels, at, side: sideView() });
  };
  const sideView = (): SideView | null => (dragging?.side ? { offer: dragging.side.offer, armed: dragging.side.armed, pill: dragging.side.pill, refusal: dragging.side.refusal } : null);

  // The side drop the pointer offers (spec drag-layout, row 5): a new offer (another target or side) starts the dwell
  // anew; after wrap.sideDwell in the same band it is confirmed, its pill drawn at the pointer, and it stays while the
  // pointer is within wrap.pillFreeze of the pill. The refusal its wrap would meet is asked of its command.
  const offer = (at: Point, onPage: boolean) => {
    if (dragging === null) return;
    const current = dragging.side;
    if (SIDE_DWELL > 0 && current?.armed && current.pill !== null && Math.hypot(at.x - current.pill.x, at.y - current.pill.y) <= PILL_FREEZE) return;
    // the side drop drawn holds while the pointer stays by that side of its element, wrap.sideEdgeExclusion around it: a
    // tremor never moves it to another element (spec drag-layout, the user's decision: no surgical pointing)
    const door = dragging.inserting !== null ? sideTileFor(dragging.inserting) : SIDE_ELEMENT;
    const fresh = door === null || (dragging.inserting !== null && !onPage) ? null : sideAt(store.getState().document, dragging.dragged, at);
    // a tremor out of the element keeps its side drop, but a deeper element's own side drop takes over
    const deeper = fresh !== null && current !== null && fresh.target !== current.offer.target && isInside(store.getState().document, fresh.target, current.offer.target);
    if (current !== null && !deeper && keepsSide(current.offer, at)) return;
    const next = fresh;
    const same = next !== null && current !== null && next.target === current.offer.target && next.side === current.offer.side;
    if (same) return;
    if (dwell !== null) clearTimeout(dwell);
    dwell = null;
    if (next === null || door === null) {
      dragging.side = null;
      return;
    }
    const args = { ...door.door.args, target: next.target, side: next.side, wrapper: next.wrapper, ...(dragging.inserting !== null ? dragging.inserting.args : {}) };
    dragging.side = { offer: next, armed: false, pill: null, refusal: store.refusal(door.command.id, args as never) };
    // with no dwell (interactions.json wrap.sideDwell 0) the side zone confirms the offer at once
    if (SIDE_DWELL <= 0) {
      dragging.side = { ...dragging.side, armed: true, pill: { x: at.x + PILL_OFFSET[0], y: at.y + PILL_OFFSET[1] } };
      return;
    }
    dwell = setTimeout(() => {
      dwell = null;
      if (dragging?.side?.offer !== next) return;
      dragging.side = { ...dragging.side, armed: true, pill: { x: pointerAt.x + PILL_OFFSET[0], y: pointerAt.y + PILL_OFFSET[1] } };
      redraw(pointerAt, true);
    }, SIDE_DWELL);
  };

  // Autoscroll (spec drag-layout, row 8): while the pointer is within drop.autoscrollZone of the top or the bottom of
  // the page's visible box, once it has been inside that box beyond the zone, the page scrolls each frame by up to
  // drop.autoscrollMaxStep screen pixels, more the nearer the edge; the proposal follows the scrolled page.
  const autoscroll = () => {
    scrolling = 0;
    const frame = canvasFrame();
    if (dragging === null || !frame) return;
    const box = frame.getBoundingClientRect();
    const fromTop = pointerAt.y - box.top;
    const fromBottom = box.bottom - pointerAt.y;
    const across = pointerAt.x >= box.left && pointerAt.x <= box.right;
    if (across && fromTop > AUTOSCROLL_ZONE && fromBottom > AUTOSCROLL_ZONE) insideOnce = true;
    let step = 0;
    if (insideOnce && across && fromTop >= 0 && fromTop < AUTOSCROLL_ZONE) step = -AUTOSCROLL_MAX * (1 - fromTop / AUTOSCROLL_ZONE);
    else if (insideOnce && across && fromBottom >= 0 && fromBottom < AUTOSCROLL_ZONE) step = AUTOSCROLL_MAX * (1 - fromBottom / AUTOSCROLL_ZONE);
    if (step !== 0 && scrollPage(frame, step)) over(pointerAt, dragging.inserting === null || nodesUnder(frame, pointerAt).length > 0);
    scrolling = requestAnimationFrame(autoscroll);
  };
  // Resting on a folded row during a drag unfolds it after layers.expandDwell (spec layers-drag, Problems in Pager 1);
  // leaving it earlier cancels the timer. The unfolding runs the dwell's door in the drag's gesture.
  const rest = (row: { readonly node: NodeId; readonly folded: boolean } | null) => {
    if (dragging === null) return;
    const folded = row !== null && row.folded ? row.node : null;
    if (folded === dragging.resting) return;
    dragging.resting = folded;
    if (unfold !== null) clearTimeout(unfold);
    unfold = null;
    if (folded === null || ROW_DWELL === null) return;
    unfold = setTimeout(() => {
      unfold = null;
      if (dragging?.resting !== folded) return;
      open?.dispatch(ROW_DWELL.command.id as CommandId, { ...ROW_DWELL.door.args, target: folded } as never);
    }, EXPAND_DWELL);
  };
  const stopDragTimers = () => {
    if (unfold !== null) clearTimeout(unfold);
    unfold = null;
    if (dwell !== null) clearTimeout(dwell);
    dwell = null;
    if (scrolling !== 0) cancelAnimationFrame(scrolling);
    scrolling = 0;
    insideOnce = false;
  };

  // While a drag goes on, each pointer position proposes a drop; a new proposal replaces the pointer's own only once
  // the pointer is drag.hysteresis screen pixels from where that one was taken. A creation drag proposes a drop only
  // over the page (the canvas overlay): over the stage around it or over a panel it proposes none (spec
  // palette-drag-insert, "Hit zones").
  // whether the selection is one a free drag moves: its command's predicate holds (a lock still refuses the move,
  // which the status bar says)
  const positionedNow = () => {
    if (FREE_DRAG === null) return false;
    const why = store.refusal(FREE_DRAG.command.id as CommandId, { ...FREE_DRAG.door.args, dx: 0, dy: 0 } as never);
    return why === null || why.key !== FREE_DRAG.command.availability.refusalKey;
  };
  // A resize's travel in page px: with snap on and Ctrl not held, the dragged edges are pulled to the nearest enabled
  // target first (canvas/snapping.ts); with smart guides on, what they align with is drawn. Alt (from the centre) and
  // Shift (the aspect) keep their own meanings.
  const snappedResize = (r: NonNullable<typeof resizing>, dx: number, dy: number, suspended: boolean): Point => {
    const state = store.getState();
    const mode = snapMode(state, suspended);
    if ((!mode.apply && !mode.hint) || r.box === null) {
      snapShown.set(null);
      return { x: dx, y: dy };
    }
    const sides = r.handle.slice(r.handle.lastIndexOf('-') + 1);
    const east = sides.includes('e');
    const west = sides.includes('w');
    const south = sides.includes('s');
    const north = sides.includes('n');
    const box = { x: r.box.x + (west ? dx : 0), y: r.box.y + (north ? dy : 0), width: r.box.width + (east ? dx : west ? -dx : 0), height: r.box.height + (south ? dy : north ? -dy : 0) };
    const snapped = snapResize(state, r.node, box, sides, r.zoom, mode.apply);
    snapShown.set(mode.hint ? snapped : null);
    return { x: dx + snapped.offset.x, y: dy + snapped.offset.y };
  };
  // a free drag follows the pointer: the travel since the press, in whole page px, less what already ran; with snap on
  // and Ctrl not held, the moved box is pulled to the nearest enabled target or equal gap first (canvas/snapping.ts);
  // with smart guides on, what it aligns with and the gaps it repeats are drawn
  const moveFree = (at: Point, suspended: boolean) => {
    if (freeing === null || open === null || FREE_DRAG === null) return;
    const travel = { x: (at.x - freeing.start.x) / freeing.zoom, y: (at.y - freeing.start.y) / freeing.zoom };
    const state = store.getState();
    const mode = snapMode(state, suspended);
    const snapped = (mode.apply || mode.hint) && freeing.node !== null && freeing.box !== null ? snapMove(state, freeing.node, { ...freeing.box, x: freeing.box.x + travel.x, y: freeing.box.y + travel.y }, freeing.zoom, mode.apply) : null;
    snapShown.set(mode.hint ? snapped : null);
    const total = { x: Math.round(travel.x + (snapped?.offset.x ?? 0)), y: Math.round(travel.y + (snapped?.offset.y ?? 0)) };
    const dx = total.x - freeing.applied.x;
    const dy = total.y - freeing.applied.y;
    if (dx === 0 && dy === 0) return;
    freeing.applied = total;
    open.dispatch(FREE_DRAG.command.id as CommandId, { ...FREE_DRAG.door.args, dx, dy } as never);
  };
  const over = (at: Point, onPage: boolean) => {
    if (dragging === null) return;
    const creation = dragging.inserting !== null;
    // over a Layers row (an element drag, from the canvas or from Layers): the row's zones decide (spec layers-drag)
    const row = creation || ROW_DROP === null ? null : rowUnder(at);
    rest(row);
    dragging.fromRow = row !== null;
    const next = row !== null ? rowDrop(store.getState().document, (type) => CONTAINERS.has(type), dragging.dragged, row.node, row.at) : creation && !onPage ? null : proposalAt(store.getState().document, dragging.dragged, at);
    const taken = JSON.stringify(next) !== JSON.stringify(dragging.base) && !(dragging.takenAt !== null && Math.hypot(at.x - dragging.takenAt.x, at.y - dragging.takenAt.y) < DRAG_HYSTERESIS);
    if (taken) {
      dragging.base = next;
      dragging.takenAt = at;
      liveDrag.propose(next);
    }
    const offered = dragging.side;
    if (row === null) offer(at, onPage);
    else dragging.side = null;
    redraw(at, creation || dragging.dragged.length > 0 || offered !== dragging.side);
    if (scrolling === 0) scrolling = requestAnimationFrame(autoscroll);
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
    // the colour picker's area, during its session: the colour it points at, then at every move while held
    const area = session !== null && event.button === 0 && event.target instanceof Element ? event.target.closest<HTMLElement>('[data-color-area]') : null;
    if (area !== null) {
      event.preventDefault();
      pickingColor = { area, pointer: event.pointerId };
      pickColor(area, event.clientX, event.clientY);
      return;
    }
    // a handle of the Edit on canvas mode, pressed with the primary button
    const bandEl = event.button === 0 && machine.phase === 'idle' && event.target instanceof Element ? event.target.closest<HTMLElement>('[data-canvas-overlay] [data-edit-handle]') : null;
    const bandEntry = bandEl ? manifest.doorByRef.get((bandEl.getAttribute('data-door') ?? '') as DoorId) : undefined;
    const bandZoom = canvasFrame()?.currentCSSZoom;
    if (bandEl && bandEntry && bandEl.getAttribute('aria-disabled') !== 'true' && bandZoom !== undefined && bandZoom > 0) {
      event.preventDefault();
      const parsed: unknown = JSON.parse(bandEl.getAttribute('data-args') ?? '{}');
      // what the handle stands for, its own name (for its arrows) aside
      const { handle: _named, ...args } = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
      void _named;
      const [nx = 0, ny = 0] = (bandEl.getAttribute('data-normal') ?? '0,0').split(',').map(Number);
      const min = bandEl.getAttribute('data-min');
      spacing = {
        entry: bandEntry,
        args,
        valueArg: bandEl.getAttribute('data-value-arg') ?? 'value',
        element: bandEl,
        start: Number(bandEl.getAttribute('data-start') ?? '0'),
        normal: [nx, ny],
        min: min === null || min === '' ? null : Number(min),
        opposite: bandEl.getAttribute('data-opposite') ?? '',
        oppositeStart: Number(bandEl.getAttribute('data-opposite-start') ?? '0'),
        pointer: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        zoom: bandZoom,
        shadow:
          bandEl.hasAttribute('data-shadow')
            ? { property: args.property ?? '', offset: bandEl.getAttribute('data-shadow') === SHADOW_OFFSET, x: Number(bandEl.getAttribute('data-start-x') ?? '0'), y: Number(bandEl.getAttribute('data-start-y') ?? '0') }
            : null,
        gesture: null,
        cancels: 0,
      };
      return;
    }
    // a guide, or a ruler (a new guide), pressed with the primary button
    const guideEl = event.button === 0 && machine.phase === 'idle' && event.target instanceof Element ? event.target.closest('[data-canvas-overlay] [data-guide]') : null;
    const rulerEl = event.button === 0 && machine.phase === 'idle' && event.target instanceof Element ? event.target.closest('[data-ruler]') : null;
    if (guideEl instanceof HTMLElement && GUIDE_MOVE !== null) {
      event.preventDefault();
      guideEl.focus();
      guiding = { kind: 'move', axis: guideEl.getAttribute('data-axis') ?? '', guide: guideEl.getAttribute('data-guide'), pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, gesture: null, cancels: 0 };
      return;
    }
    const rulerAxis = rulerEl?.getAttribute('data-ruler') ?? '';
    if (rulerEl && GUIDE_CREATES[rulerAxis]) {
      event.preventDefault();
      guiding = { kind: 'create', axis: rulerAxis, guide: null, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, gesture: null, cancels: 0 };
      return;
    }
    // the rotation handle of the selection, pressed with the primary button
    const rotator = event.button === 0 && machine.phase === 'idle' && event.target instanceof Element ? event.target.closest('[data-canvas-overlay] [data-rotate-handle]') : null;
    const rotateEntry = rotator ? manifest.doorByRef.get((rotator.getAttribute('data-door') ?? '') as DoorId) : undefined;
    if (rotator && rotateEntry) {
      const state = store.getState();
      const only = state.selection.length === 1 && state.selection[0] !== undefined ? locate(state.document, state.selection[0])?.node : undefined;
      const frame = canvasFrame();
      const box = frame && only ? nodeBox(frame, only.id) : null;
      const property = rotateEntry.door.adapter.writes[0];
      if (only && box && property !== undefined) {
        event.preventDefault();
        const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        rotating = { entry: rotateEntry, property, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, centre, startAngle: Math.atan2(event.clientY - centre.y, event.clientX - centre.x), base: degreesOf(storedValue(only, property, MODEL_RULES)), gesture: null, cancels: 0 };
        return;
      }
    }
    // a resize handle of the selection, pressed with the primary button
    const handle = event.button === 0 && machine.phase === 'idle' && event.target instanceof Element ? event.target.closest('[data-canvas-overlay] [data-resize-handle]') : null;
    const handleEntry = handle ? manifest.doorByRef.get((handle.getAttribute('data-door') ?? '') as DoorId) : undefined;
    const selected = store.getState().selection;
    const frame = canvasFrame();
    // a shape of an SVG resizes the box its geometry spans (spec elements-svg-shapes); any other element its border box
    const only = selected.length === 1 && selected[0] !== undefined ? locate(store.getState().document, selected[0])?.node : undefined;
    const shape = handleEntry && only ? shapeResizeFrom(only, geometryAttributes(MODEL_RULES, only.type, handleEntry.command.id)) : null;
    const basis = handleEntry && frame && selected.length === 1 && selected[0] !== undefined ? (shape ?? resizeBasis(frame, selected[0])) : null;
    const zoom = frame ? geometryOf(frame)?.zoom : undefined;
    // the chrome draws the handles from its last measure: right after a change (a drop that moved the element) they
    // may still stand where the element was, so a handle is taken only where the element is now
    const current = frame && selected[0] !== undefined ? nodeBox(frame, selected[0]) : null;
    if (handle && handleEntry && basis !== null && zoom !== undefined && current !== null && handleInPlace(handle, current)) {
      event.preventDefault();
      const resized = selected[0] as NodeId;
      resizing = { entry: handleEntry, handle: handle.getAttribute('data-resize-handle') ?? '', pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, basis, zoom, gesture: null, cancels: 0, node: resized, box: pageLayout.box(resized) };
      return;
    }
    // a pan: the middle button, or the primary one with Space held, on the stage
    const source = onStage(event.target) && machine.phase === 'idle' ? (event.button === 1 ? 'middle-button' : event.button === 0 && spaceDown ? 'space-held' : null) : null;
    const panEntry = source !== null ? panDrag(source) : null;
    if (panEntry !== null) {
      event.preventDefault();
      panning = { pointer: event.pointerId, last: { x: event.clientX, y: event.clientY }, moved: { x: 0, y: 0 }, entry: panEntry };
      setPanView('panning');
      return;
    }
    lastPress = { x: event.clientX, y: event.clientY };
    keepFocus = false;
    setGhostReturn(null);
    const press = pressAt(event, isRoot);
    if (press === null || press === 'elsewhere') return;
    if (event.button !== 0 && event.button !== 2) return;
    // a palette tile, a Layers row and a field's label take the primary button only
    if ((press.on === 'tile' || press.on === 'row' || press.on === 'scrub' || press.on === 'stop' || press.on === 'pad' || press.on === 'grip') && event.button !== 0) return;
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
    if (pickingColor !== null) {
      if (event.pointerId === pickingColor.pointer) pickColor(pickingColor.area, event.clientX, event.clientY);
      return;
    }
    overStage = onStage(event.target);
    setCanvasPointer(overStage ? { x: event.clientX, y: event.clientY } : null);
    if (spacing !== null) {
      if (event.pointerId !== spacing.pointer) return;
      const dx = event.clientX - spacing.from.x;
      const dy = event.clientY - spacing.from.y;
      if (spacing.gesture === null) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        spacing.gesture = store.gesture();
        spacing.cancels = store.getState().ui.drag.cancels;
        open = spacing.gesture;
      }
      // a shadow handle: the first layer's X and Y follow the pointer, or its blur its horizontal travel
      if (spacing.shadow !== null) {
        const { property, offset, x, y } = spacing.shadow;
        const edit = offset ? { layer: 0, [SHADOW_EDITS.x]: `${Math.round(x + dx / spacing.zoom)}px`, [SHADOW_EDITS.y]: `${Math.round(y + dy / spacing.zoom)}px` } : { layer: 0, [SHADOW_EDITS.blur]: `${Math.max(0, Math.round(spacing.start + dx / spacing.zoom))}px` };
        spacing.gesture.dispatch(spacing.entry.command.id as CommandId, { ...spacing.entry.door.args, property, edit, distance: dx } as never);
        return;
      }
      const held = modifierOf(event);
      // the new value in whole CSS px (a start the page computes with decimals included)
      const travel = (dx * spacing.normal[0] + dy * spacing.normal[1]) / spacing.zoom;
      const bounded = (value: number) => (spacing?.min === null || spacing === null ? value : Math.max(spacing.min, value));
      const value = bounded(Math.round(spacing.start + travel));
      const all = held !== null && held === ALL_SIDES_KEY;
      // Shift and Alt act on a spacing band alone (the one that names its opposite side)
      const band = spacing.opposite !== '';
      spacing.gesture.dispatch(spacing.entry.command.id as CommandId, { ...spacing.entry.door.args, ...spacing.args, ...(band && all ? { sides: ALL_SIDES } : {}), [spacing.valueArg]: `${value}px` } as never);
      if (band && !all && held !== null && held === OPPOSITE_KEY) {
        spacing.gesture.dispatch(spacing.entry.command.id as CommandId, { ...spacing.entry.door.args, ...spacing.args, sides: spacing.opposite, [spacing.valueArg]: `${bounded(Math.round(spacing.oppositeStart + (value - spacing.start)))}px` } as never);
      }
      return;
    }
    if (guiding !== null) {
      if (event.pointerId !== guiding.pointer) return;
      const frame = canvasFrame();
      const g = frame ? geometryOf(frame) : null;
      if (g === null) return;
      if (guiding.gesture === null) {
        if (Math.hypot(event.clientX - guiding.start.x, event.clientY - guiding.start.y) < DRAG_THRESHOLD) return;
        guiding.gesture = store.gesture();
        guiding.cancels = store.getState().ui.drag.cancels;
        open = guiding.gesture;
      }
      const onOwnRuler = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[data-ruler="${guiding.axis}"]`) != null;
      setGuideOnRuler(onOwnRuler ? guiding.axis : null);
      if (onOwnRuler) return;
      const point = screenToPage({ x: event.clientX, y: event.clientY }, g);
      const at = Math.max(0, Math.round(guiding.axis === 'horizontal' ? point.y : point.x));
      const create = GUIDE_CREATES[guiding.axis];
      if (guiding.guide === null && create) {
        guiding.gesture.dispatch(create.command.id as CommandId, { ...create.door.args, axis: guiding.axis, at } as never);
        guiding.guide = [...guidesOf(store.getState().document)].reverse().find((guide) => guide.axis === guiding?.axis)?.id ?? null;
      } else if (guiding.guide !== null && GUIDE_MOVE !== null) guiding.gesture.dispatch(GUIDE_MOVE.command.id as CommandId, { ...GUIDE_MOVE.door.args, guide: guiding.guide, at } as never);
      return;
    }
    if (rotating !== null) {
      if (event.pointerId !== rotating.pointer) return;
      if (rotating.gesture === null) {
        if (Math.hypot(event.clientX - rotating.start.x, event.clientY - rotating.start.y) < DRAG_THRESHOLD) return;
        rotating.gesture = store.gesture();
        rotating.cancels = store.getState().ui.drag.cancels;
        open = rotating.gesture;
      }
      const turned = folded(rotating.base + ((Math.atan2(event.clientY - rotating.centre.y, event.clientX - rotating.centre.x) - rotating.startAngle) * 180) / Math.PI);
      const angle = event.shiftKey ? Math.round(turned / ROTATE_SNAP) * ROTATE_SNAP : Math.round(turned);
      rotating.gesture.dispatch(rotating.entry.command.id as CommandId, { ...rotating.entry.door.args, property: rotating.property, value: `${angle}deg` } as never);
      return;
    }
    if (resizing !== null) {
      if (event.pointerId !== resizing.pointer) return;
      const dx = event.clientX - resizing.start.x;
      const dy = event.clientY - resizing.start.y;
      if (resizing.gesture === null) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        resizing.gesture = store.gesture();
        resizing.cancels = store.getState().ui.drag.cancels;
        open = resizing.gesture;
      }
      const travel = snappedResize(resizing, dx / resizing.zoom, dy / resizing.zoom, event.ctrlKey);
      const values = resizedBox(resizing.basis, resizing.handle, travel.x, travel.y, { aspect: event.shiftKey, centre: event.altKey }, RESIZE_MIN);
      const given = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
      resizing.gesture.dispatch(resizing.entry.command.id as CommandId, { ...resizing.entry.door.args, ...given } as never);
      return;
    }
    if (panning !== null) {
      if (event.pointerId !== panning.pointer) return;
      const dx = event.clientX - panning.last.x;
      const dy = event.clientY - panning.last.y;
      panning.last = { x: event.clientX, y: event.clientY };
      if (dx === 0 && dy === 0) return;
      panning.moved = { x: panning.moved.x + dx, y: panning.moved.y + dy };
      dispatchPan(panning.entry, { dx, dy });
      return;
    }
    const press = pressAt(event, isRoot);
    setHovered(machine.phase === 'idle' && press !== null && press !== 'elsewhere' && press.on === 'node' ? press.node : null);
    const at = { x: event.clientX, y: event.clientY };
    const next = step(machine, { type: 'move', pointer: event.pointerId, at });
    if (machine.phase === 'idle' || event.pointerId === machine.pointer) pointerAt = at;
    machine = next.machine;
    run(next.effect);
    // a scrub follows every move of its pointer, from the press on (no threshold)
    if (scrubbing !== null && machine.phase !== 'idle' && event.pointerId === machine.pointer) scrub(at, modifierOf(event));
    // a gradient stop follows every move of its pointer, from the press on
    if (stopping !== null && machine.phase !== 'idle' && event.pointerId === machine.pointer) moveStop(at);
    // a shadow's light follows every move of its pointer, from the press on
    if (lighting !== null && machine.phase !== 'idle' && event.pointerId === machine.pointer) moveLight(at);
    // the quick panel follows every move of its pointer, from the press on
    if (gripping !== null && machine.phase !== 'idle' && event.pointerId === machine.pointer) moveGrip(at);
    // the gesture's drag in progress, if any: the marquee's band, or the drop proposal of an element or a tile (over
    // the page: the canvas overlay is what the pointer is on)
    if (machine.phase === 'dragging' && event.pointerId === machine.pointer) {
      drawMarquee(at);
      moveFree(at, event.ctrlKey);
      over(at, press !== null && press !== 'elsewhere' && press.on === 'node');
    }
  };
  const onUp = (event: PointerEvent) => {
    if (pickingColor !== null) {
      if (event.pointerId === pickingColor.pointer) pickingColor = null;
      return;
    }
    if (spacing !== null) {
      if (event.pointerId !== spacing.pointer) return;
      const { gesture, entry, opposite, element } = spacing;
      spacing = null;
      if (gesture !== null) {
        open = null;
        gesture.commit();
        return;
      }
      // a band pressed and released without a drag: its typed field; any other handle: the focus, for its arrows
      if (opposite !== '') typedBand.open(entry.ref);
      else element.focus();
      return;
    }
    if (guiding !== null) {
      if (event.pointerId !== guiding.pointer) return;
      const { gesture, kind, guide } = guiding;
      const dropped = guideOnRuler !== null;
      guiding = null;
      setGuideOnRuler(null);
      if (gesture === null) return;
      open = null;
      // over its own ruler: a new guide is not made, a moved one is deleted
      if (dropped && kind === 'create') {
        gesture.cancel();
        return;
      }
      if (dropped && guide !== null && GUIDE_DELETE !== null) gesture.dispatch(GUIDE_DELETE.command.id as CommandId, { ...GUIDE_DELETE.door.args, guide } as never);
      gesture.commit();
      return;
    }
    if (rotating !== null) {
      if (event.pointerId !== rotating.pointer) return;
      const { gesture } = rotating;
      rotating = null;
      if (gesture !== null) {
        open = null;
        gesture.commit();
      }
      return;
    }
    if (resizing !== null) {
      if (event.pointerId !== resizing.pointer) return;
      const { gesture, start } = resizing;
      resizing = null;
      snapShown.set(null);
      if (gesture !== null) {
        open = null;
        gesture.commit();
        return;
      }
      // a handle pressed and released without a drag is a click on what lies under it (a neighbour the handle, drawn
      // outside its element, covers): the press and the release run as they would have there
      const frame = canvasFrame();
      const hit = frame ? nodeAt(frame, start) : null;
      if (hit === null) return;
      leaveField();
      buttons = { button: 'primary', count: 1, modifier: modifierOf(event) };
      pointerAt = start;
      const down = step(machine, { type: 'down', pointer: event.pointerId, at: start, press: { on: 'node', node: hit.node, root: hit.root } });
      if (down.effect === 'press') pressedAt = { screen: start, page: pagePoint(start) };
      machine = down.machine;
      run(down.effect);
      const up = step(machine, { type: 'up', pointer: event.pointerId });
      machine = up.machine;
      run(up.effect);
      return;
    }
    if (panning !== null) {
      if (event.pointerId !== panning.pointer) return;
      panning = null;
      setPanView(spaceDown ? 'armed' : 'idle');
      return;
    }
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
  // otherwise hand it to the page body right after. Nor does a press on the text edited in place, or on the text
  // toolbar while it is edited: the focus, and the text selection, stay in the text.
  const onMouseDown = (event: MouseEvent) => {
    // the middle button on the stage pans; the browser's own autoscroll does not start
    if (event.button === 1 && onStage(event.target)) event.preventDefault();
    const keep = keepFocus;
    keepFocus = false;
    const toolbar = editedNode(store.getState()) !== null && onTextToolbar(event.target);
    if (keep || toolbar || (event.button === 2 && event.target instanceof Element && event.target.closest(EDITOR_MENU_AREA))) event.preventDefault();
  };

  // A drag Escape cancelled ends its gesture at once, its button still down: the drag and what it would do at the
  // release (its drop, a tile's click or insertion) are dropped, and the machine is idle, so the release that follows
  // does nothing. What the press itself did stays (the element it selected: spec drag-level-keys-escape, the selection
  // after Escape is the dragged element); a marquee's band is its own selection, and goes back to the selection held
  // before the press (spec marquee-select). A creation drag's ghost goes back to the tile it came from.
  const endCancelled = () => {
    // a marquee's band and a scrub's values go back to what they were before the press; any other drag keeps what its
    // press did
    const effect: Effect = marquee !== null || scrubbing !== null || stopping !== null || lighting !== null || gripping !== null ? 'cancel' : 'commit';
    stopDragTimers();
    if (dragging?.inserting != null && pressedAt !== null) setGhostReturn({ inserting: dragging.inserting, from: pointerAt, to: pressedAt.screen });
    dragging = null;
    pressed = null;
    machine = IDLE;
    run(effect);
  };

  // The keys of the drag (drag-session.ts) change the editor state while the gesture is open: a level key's new level
  // is redrawn at once; drag.cancel records a cancellation, and one newer than the open gesture ends it (once the
  // dispatch that recorded it has returned).
  // the picker's session follows the picker: opened with it, committed or cancelled as it closes
  let pickerClosings = store.getState().ui.colorPickerClosed.count;
  let pickerCancels = store.getState().ui.drag.cancels;
  sessionDispatch = (id, args) => {
    const through = session ?? null;
    return through !== null ? through.dispatch(id as never, args as never) : (store.dispatch as (i: CommandId, a: unknown) => DispatchResult)(id, args);
  };
  const followPicker = () => {
    const ui = store.getState().ui;
    if (ui.colorPicker !== null && session === null && open === null) {
      session = store.gesture();
      open = session;
      pickerCancels = ui.drag.cancels;
      pickerClosings = ui.colorPickerClosed.count;
      return;
    }
    if (session === null) return;
    const ended = ui.colorPickerClosed.count !== pickerClosings;
    const escaped = ui.drag.cancels !== pickerCancels;
    if (!ended && !escaped) return;
    pickerClosings = ui.colorPickerClosed.count;
    const closing = session;
    session = null;
    open = null;
    const applied = ended && ui.colorPickerClosed.applied;
    queueMicrotask(() => {
      // Escape ended the session: the picker closes too, inside it, so that nothing opens a session again
      if (escaped && store.getState().ui.colorPicker !== null) closing.dispatch(CANCEL_PICKER as never, {} as never);
      if (applied) closing.commit();
      else closing.cancel();
    });
  };
  const stopPicker = store.subscribe(followPicker);
  const stopListening = store.subscribe(() => {
    if (session !== null) return;
    // Escape during a band's drag (drag.cancel): the side goes back to where it was
    if (spacing?.gesture != null && store.getState().ui.drag.cancels !== spacing.cancels) {
      const cancelled = spacing.gesture;
      spacing = null;
      open = null;
      queueMicrotask(() => cancelled.cancel());
      return;
    }
    // Escape during a guide drag (drag.cancel): a new guide is not made, a moved one goes back
    if (guiding?.gesture != null && store.getState().ui.drag.cancels !== guiding.cancels) {
      const cancelled = guiding.gesture;
      guiding = null;
      setGuideOnRuler(null);
      open = null;
      queueMicrotask(() => cancelled.cancel());
      return;
    }
    // Escape during a rotation (drag.cancel): the angle goes back to where it was
    if (rotating?.gesture != null && store.getState().ui.drag.cancels !== rotating.cancels) {
      const cancelled = rotating.gesture;
      rotating = null;
      open = null;
      queueMicrotask(() => cancelled.cancel());
      return;
    }
    // Escape during a resize (drag.cancel, a newer cancellation): the size goes back to where it was
    if (resizing?.gesture != null && store.getState().ui.drag.cancels !== resizing.cancels) {
      const cancelled = resizing.gesture;
      resizing = null;
      snapShown.set(null);
      open = null;
      queueMicrotask(() => cancelled.cancel());
      return;
    }
    if (open === null) return;
    if (store.getState().ui.drag.cancels === cancelsAtOpen) {
      redraw(pointerAt, false);
      return;
    }
    const cancelled = open;
    queueMicrotask(() => {
      if (open === cancelled) endCancelled();
    });
  });

  // the pan's and the wheel's doors, run through the store
  const dispatchPan = (entry: DoorEntry, args: Readonly<Record<string, unknown>>) => {
    (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args });
  };
  panDispatch = dispatchPan;
  const onWheel = (event: WheelEvent) => {
    if (!onStage(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey ? 'Ctrl' : event.shiftKey ? 'Shift' : null;
    const entry = WHEEL_DOORS.find((d) => d.door.kind === 'canvas-wheel' && d.door.modifier === modifier);
    if (!entry) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? target.innerHeight : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if ('factor' in entry.command.args) dispatchPan(entry, { factor: Math.exp(-dy * WHEEL_FACTOR), point: { x: event.clientX, y: event.clientY } });
    else if (modifier === 'Shift') dispatchPan(entry, { dx: -(dx !== 0 ? dx : dy), dy: 0 });
    else dispatchPan(entry, { dx: -dx, dy: -dy });
  };
  target.addEventListener('wheel', onWheel, { passive: false, capture: true });
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
    stopPicker();
    sessionDispatch = null;
    onCancel();
    panDispatch = null;
    target.removeEventListener('wheel', onWheel, { capture: true });
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
