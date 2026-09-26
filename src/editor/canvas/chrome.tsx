// The canvas chrome (ARCHITECTURE.md): what the editor draws over the page, on the canvas overlay: the outline of
// every selected node and the primary's label (its name and its exported tag, so the page root reads "body"); with
// several selected, the dashed outline of their union and one label counting them ("3 elements selected"); the
// thinner outline of the node the pointer hovers (pointer.ts); the band of a marquee while pointer.ts draws one
// (spec marquee-select: a 1 px accent border, a 16 % accent fill); and during an element drag (pointer.ts), the drop
// indicator (the insertion line, the receiver's outline and the drop label), with the dragged selection's outline
// dashed and its label hidden. A palette tile's creation drag (spec palette-drag-insert: nothing dragged) draws the
// same indicator, its label reading "Insert Paragraph · position 2 of 4 in Hero" (Problems in Pager 1), and, where
// the element's command would refuse it, the refused indicator with that refusal and no line (Problems in Pager 3);
// it leaves the selection's outline solid, and its ghost, the element's icon and name, follows the pointer at
// drag.ghostOffset over the whole window (Problems in Pager 4); cancelled with Escape, the ghost goes back to its
// tile and fades out (spec drag-level-keys-escape, Problems in Pager 4). While the keyboard's hand holds an element
// (core/structure/hand.ts), the same indicator stands at the hand's aim, with the refusal the move would meet there
// (spec hand-keyboard-move, "Visual feedback"). While a text is edited in place, its outline and label ("Editing
// text · Intro") wear the text editing mode colour instead of the selection's, and the text toolbar (text-toolbar.tsx)
// sits above the label, the two placed as one by the label rule; the toolbar's controls take presses of their own.
// The label of the one selected element is the one part of the chrome that takes a
// press: pointer.ts reads it (data-label-for) as a press on that element (spec select-click, "Hit zones"). Where a
// node is on the screen comes from the
// coordinates module (nodeBox), measured on every animation frame while there is something to draw, so the chrome
// follows scrolling, zoom and layout; the page itself is never touched (only the renderer writes it). Apart from
// those labels the chrome takes no pointer event, and it has no listener of its own (pointer.ts owns every gesture).
//
// Label rule (DESIGN.md "Canvas"): a label never covers page content. It sits above its element when that space is
// free, otherwise inside the element's top-left corner when that corner is free, otherwise below the element.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { message, type Message } from '../../core/commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import { lineExtent, linesOf, sameLine } from '../../core/geometry/lines.ts';
import { heldHand, type HandState } from '../../core/structure/hand.ts';
import type { MessageId } from '../../generated/ids.ts';
import { elementIcon, manifest } from '../../manifest/runtime.ts';
import { Icon, isDoorBuilt } from '../doors/door.tsx';
import { GLYPHS } from '../doors/placement.ts';
import type { DropProposal } from '../drag/drop.ts';
import { band, drag, ghostReturn, hover, lastDrop, measuring, type DragView, type GhostReturn, type Inserting, type SideView } from '../input/pointer.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { canvasFrame, contentBoxes, flowAxis, flowReversed, holdsNode, innerBox, nodeBox } from './coordinates.ts';
import { TextToolbar } from './text-toolbar.tsx';
import { EditHandles } from './edit-handles.tsx';
import { editMode, EDIT_MODES } from './edit-mode.ts';

// no Edit on canvas mode: canvas.setEditMode's first value
const NO_MODE = EDIT_MODES[0];
import { ViewOverlays } from './view-overlays.tsx';
import { GridOverlay } from './grid-overlay.tsx';

// the palette's entries by id: the element a creation drag inserts and the words that name it
// the resize handles (spec resize-handles): the doors of the resize gesture, one per handle, drawn on the one selected
// element that can be resized (not the page, not locked, shown), each pressed outside the element
// (the resize gesture: the one whose Shift keeps the aspect ratio, interactions.json)
const RESIZE_GESTURE = manifest.interactions.gestures.find((g) => g.modifiers.some((m) => m.meaning === 'keep-aspect-ratio'))?.id;
const RESIZE_HANDLES = manifest.doors.filter((d) => d.door.kind === 'canvas-handle' && d.door.gesture === RESIZE_GESTURE);
// the rotation handle (spec rotation-handle): outside the selection's top-right corner, dragged by the pointer owner
const ROTATE_GESTURE = manifest.interactions.gestures.find((g) => g.modifiers.some((m) => m.meaning === 'snap-to-15-degree-steps'))?.id;
const ROTATE_HANDLE = manifest.doors.find((d) => d.door.kind === 'canvas-handle' && d.door.gesture === ROTATE_GESTURE) ?? null;
const handlePoint = (handle: string, b: { x: number; y: number; width: number; height: number }) => {
  const side = handle.slice(handle.lastIndexOf('-') + 1);
  return { left: b.x + (side.includes('w') ? 0 : side.includes('e') ? b.width : b.width / 2), top: b.y + (side.includes('n') ? 0 : side.includes('s') ? b.height : b.height / 2) };
};

const PALETTE = new Map(manifest.elements.palette.flatMap((g) => g.entries.map((e) => [e.id, e] as const)));

// What a creation drag inserts, as its words and its ghost show it: a palette entry's label and its element's icon, or
// a component's name and its tile's icon (spec reusable-components); null for a tile that stands for neither.
function insertingLook(inserting: Inserting): { readonly name: { readonly key: MessageId } | string; readonly icon: string; readonly id: string } | null {
  const entry = inserting.args.entry;
  const item = typeof entry === 'string' ? PALETTE.get(entry) : undefined;
  if (item !== undefined) return { name: { key: item.labelKey as MessageId }, icon: elementIcon(item.element) ?? GLYPHS.folder, id: item.id };
  const component = inserting.args.component;
  if (typeof component === 'string') return { name: component, icon: inserting.tile.door.icon ?? GLYPHS.folder, id: component };
  return null;
}
// where a creation drag's ghost sits from the pointer, in screen pixels (interactions.json)
const GHOST_OFFSET = ((): readonly [number, number] => {
  const value = manifest.interactions.constants.find((c) => c.id === 'drag.ghostOffset')?.value;
  if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'number') throw new Error('interactions.json has no pair drag.ghostOffset');
  return [value[0], value[1]];
})();
// how long the elements a drop placed flash (interactions.json drop.flashDuration)
const FLASH_MS = (() => {
  const value = manifest.interactions.constants.find((c) => c.id === 'drop.flashDuration')?.value;
  if (typeof value !== 'number') throw new Error('interactions.json has no number drop.flashDuration');
  return value;
})();
// how long the ghost of a cancelled creation drag takes to go back to its tile: halfway between the bounds of
// interactions.json (spec drag-level-keys-escape, Problems in Pager 4: 150 to 250 ms)
const GHOST_RETURN_MS = ((): number => {
  const bound = (id: string) => manifest.interactions.constants.find((c) => c.id === id)?.value;
  const [min, max] = [bound('drag.cancelReturnMin'), bound('drag.cancelReturnMax')];
  if (typeof min !== 'number' || typeof max !== 'number') throw new Error('interactions.json has no number drag.cancelReturnMin or drag.cancelReturnMax');
  return (min + max) / 2;
})();

// What the drop indicator draws: the drag in progress (pointer.ts), or the aim of the keyboard's hand, which has no
// pointer and no ghost (and climbs no level of a drag).
type DropView = Pick<DragView, 'dragged' | 'inserting' | 'proposal' | 'refusal' | 'levels' | 'side'> & { readonly at: DragView['at'] | null };

// The words of the drag in progress (DESIGN.md "Canvas", drag): what its drop label reads, and, for a palette tile's
// creation drag, the status bar too (spec palette-drag-insert, Problems in Pager 1 and 2). Over the dragged nodes'
// own subtree, or where the new element's command refuses it, the refusal; a move reads "Drop in Hero · position 2 of
// 3"; a creation drag "Insert Paragraph · position 2 of 4 in Hero", or "Insert Container · into Actions" into a
// receiver with no child, and, with no proposal (off the page), "Outside the page — release to cancel.". Null for a
// move with no proposal. The hand's aim reads as a move, or its refusal. A proposal the level keys climbed says how
// many receiver levels it climbed ("· ↑1", spec drag-level-keys-escape, Problems in Pager 3): the levels actually
// climbed, never the keys pressed.
export function dragWords(document: DocumentJson, view: DropView): Message | null {
  const { proposal, dragged, inserting, refusal, levels } = view;
  // a confirmed side drop names the wrapper it creates, or the refusal its wrap would meet
  if (view.side?.armed === true) return view.side.refusal ?? sideWords(document, view.side, dragged, inserting);
  if (proposal === null) return inserting !== null ? message('status.drop.outsidePage') : null;
  // the refusal its drop would meet (a creation drag's, the hand's aim), else the dragged nodes' own subtree
  if (refusal !== null) return refusal;
  if (proposal.refused) return message('status.refused.intoItself');
  const receiver = locate(document, proposal.parent)?.node ?? null;
  if (receiver === null) return null;
  const siblings = receiver.children.filter((c) => !dragged.includes(c.id));
  if (inserting === null) {
    const where = { parent: receiver.name, position: proposal.index + 1, count: siblings.length + dragged.length };
    return levels > 0 ? message('canvas.dropTargetLevel', { ...where, levels }) : message('canvas.dropTarget', where);
  }
  const element = insertingLook(inserting)?.name ?? '';
  if (siblings.length === 0) return message('canvas.insertInto', { element, parent: receiver.name });
  const where = { element, position: proposal.index + 1, count: siblings.length + 1, parent: receiver.name };
  return levels > 0 ? message('canvas.insertTargetLevel', { ...where, levels }) : message('canvas.insertTarget', where);
}

// What a confirmed side drop reads: "Create a row: Paragraph beside Card" (a Column in a row parent).
function sideWords(document: DocumentJson, side: SideView, dragged: readonly NodeId[], inserting: Inserting | null): Message {
  const target = locate(document, side.offer.target)?.node.name ?? '';
  const first = dragged[0] === undefined ? null : (locate(document, dragged[0])?.node.name ?? null);
  const looked = inserting === null ? null : insertingLook(inserting);
  const name = looked !== null ? looked.name : dragged.length > 1 ? String(dragged.length) : (first ?? '');
  return message(side.offer.wrapper === 'row' ? 'canvas.drop.sideRow' : 'canvas.drop.sideColumn', { name, target });
}

// Where an insertion line is drawn: its place and its length; its thickness is the class's (across or down).
const lineStyle = (b: Box): CSSProperties => (b.height === 0 ? { left: b.x, top: b.y, width: b.width } : { left: b.x, top: b.y, height: b.height });

// The line of a confirmed side drop: along the target's side edge, on the side the dragged element goes.
export function sideLine(target: Box, side: SideView['offer']): Box {
  if (side.wrapper === 'row') return { x: side.side === 'before' ? target.x : target.x + target.width, y: target.y, width: 0, height: target.height };
  return { x: target.x, y: side.side === 'before' ? target.y : target.y + target.height, width: target.width, height: 0 };
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type Placement = 'above' | 'inside' | 'below';
interface Layout {
  readonly selected: readonly Box[];
  // the box around every selected node, drawn dashed while several are selected (DESIGN.md "Canvas", multi)
  readonly union: Box | null;
  readonly hovered: Box | null;
  readonly label: { readonly box: Box; readonly placement: Placement } | null;
  // where the text toolbar goes while a text is edited in place: above the edit's label, placed with it as one
  readonly toolbar: { readonly x: number; readonly y: number } | null;
  // the marquee's band while one is drawn (pointer.ts)
  readonly band: Box | null;
  // where the rotation handle of the one selected node goes (rotateSpot)
  readonly rotate: { readonly x: number; readonly y: number } | null;
  // the hovered element's size in CSS px, drawn below its hover outline (spec hover-measure)
  readonly hoverSize: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  // while Alt is held, the distances from the selection to the hovered element, each a line and its length in CSS px
  readonly distances: readonly Distance[];
}

interface Distance {
  readonly box: Box;
  readonly value: number;
}

// The distances Alt measures (spec hover-measure, Problems in Pager 2), in the chrome's screen px, each with its length
// in CSS px (screen px divided by the zoom): over an ancestor of the selection, from the selection to the ancestor's
// inner edges (its padding box); over any other element, between the nearest edges of the two on each axis where they
// do not overlap, at the middle of what they share on the other axis, else of the selection.
function distancesOf(selected: Box, other: Box, inner: Box | null, zoom: number): Distance[] {
  const css = (px: number) => Math.round(px / zoom);
  const midX = selected.x + selected.width / 2;
  const midY = selected.y + selected.height / 2;
  if (inner !== null) {
    const right = selected.x + selected.width;
    const bottom = selected.y + selected.height;
    return [
      { box: { x: midX, y: inner.y, width: 0, height: selected.y - inner.y }, value: css(selected.y - inner.y) },
      { box: { x: midX, y: bottom, width: 0, height: inner.y + inner.height - bottom }, value: css(inner.y + inner.height - bottom) },
      { box: { x: inner.x, y: midY, width: selected.x - inner.x, height: 0 }, value: css(selected.x - inner.x) },
      { box: { x: right, y: midY, width: inner.x + inner.width - right, height: 0 }, value: css(inner.x + inner.width - right) },
    ].filter((d) => d.value > 0);
  }
  const shared = (a0: number, a1: number, b0: number, b1: number, fallback: number) => (Math.max(a0, b0) < Math.min(a1, b1) ? (Math.max(a0, b0) + Math.min(a1, b1)) / 2 : fallback);
  const out: Distance[] = [];
  const y = shared(selected.y, selected.y + selected.height, other.y, other.y + other.height, midY);
  if (other.x >= selected.x + selected.width) out.push({ box: { x: selected.x + selected.width, y, width: other.x - selected.x - selected.width, height: 0 }, value: css(other.x - selected.x - selected.width) });
  else if (other.x + other.width <= selected.x) out.push({ box: { x: other.x + other.width, y, width: selected.x - other.x - other.width, height: 0 }, value: css(selected.x - other.x - other.width) });
  const x = shared(selected.x, selected.x + selected.width, other.x, other.x + other.width, midX);
  if (other.y >= selected.y + selected.height) out.push({ box: { x, y: selected.y + selected.height, width: 0, height: other.y - selected.y - selected.height }, value: css(other.y - selected.y - selected.height) });
  else if (other.y + other.height <= selected.y) out.push({ box: { x, y: other.y + other.height, width: 0, height: selected.y - other.y - other.height }, value: css(selected.y - other.y - other.height) });
  return out;
}

// The rotation handle's place (spec rotation-handle): a fixed screen distance outside the box's top-right corner, held
// inside the canvas (the chrome is clipped to it): inside the corner on a side where outside would leave it, and at
// the canvas's edge when even the corner lies beyond it (a turned element's box can be larger than the page)
function rotateSpot(box: Box, area: { readonly width: number; readonly height: number }, size: number, gap: number): { readonly x: number; readonly y: number } {
  const outside = { x: box.x + box.width + gap, y: box.y - gap - size };
  const x = outside.x + size <= area.width ? outside.x : box.x + box.width - gap - size;
  const y = outside.y >= 0 ? outside.y : box.y + gap;
  return { x: Math.min(Math.max(x, 0), area.width - size), y: Math.min(Math.max(y, 0), area.height - size) };
}
const EMPTY: Layout = { selected: [], union: null, hovered: null, label: null, toolbar: null, band: null, rotate: null, hoverSize: null, distances: [] };

// the smallest box around every box given; null for none
export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const within = (a: Box, area: Box) => a.x >= area.x && a.y >= area.y && a.x + a.width <= area.x + area.width && a.y + a.height <= area.y + area.height;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Where the label of a box goes: the first free place in the rule's order, all in screen pixels; a place is free
// when it lies on the canvas and covers no page content. With none free it goes below.
// The selection's label: always above its element (DESIGN.md "Label rule", the user's decision), held inside the
// canvas at its top and at its sides.
export function placeAbove(box: Box, size: { readonly width: number; readonly height: number }, gap: number, canvas: Box): { box: Box; placement: Placement } {
  const x = Math.max(canvas.x, Math.min(box.x, canvas.x + canvas.width - size.width));
  const y = Math.max(canvas.y, box.y - gap - size.height);
  return { placement: 'above', box: { x, y, ...size } };
}

export function placeLabel(box: Box, size: { readonly width: number; readonly height: number }, gap: number, content: readonly Box[], canvas: Box): { box: Box; placement: Placement } {
  const places: { box: Box; placement: Placement }[] = [
    { placement: 'above', box: { x: box.x, y: box.y - gap - size.height, ...size } },
    { placement: 'inside', box: { x: box.x + gap, y: box.y + gap, ...size } },
    { placement: 'below', box: { x: box.x, y: box.y + box.height + gap, ...size } },
  ];
  return places.find((p) => within(p.box, canvas) && !content.some((c) => overlaps(p.box, c))) ?? (places[2] as { box: Box; placement: Placement });
}

// Where the insertion line of a drop goes, on the screen: in the middle of the gap between the reference and its
// neighbour on the side of the drop as shown (the reference's own edge when it has none there), along the receiver's
// flow axis; across the receiver's box, or across the line of children the reference is on (`across`, when the
// receiver lays its children on several lines: a grid's row, a wrapped line).
export function dropLine(axis: 'x' | 'y', receiver: Box, reference: Box, neighbour: Box | null, placement: 'before' | 'after', across: { readonly from: number; readonly to: number } | null = null): Box {
  const [start, end] = axis === 'y' ? [(b: Box) => b.y, (b: Box) => b.y + b.height] : [(b: Box) => b.x, (b: Box) => b.x + b.width];
  const at = placement === 'before' ? (neighbour ? (end(neighbour) + start(reference)) / 2 : start(reference)) : neighbour ? (end(reference) + start(neighbour)) / 2 : end(reference);
  const span = across ?? (axis === 'y' ? { from: receiver.x, to: receiver.x + receiver.width } : { from: receiver.y, to: receiver.y + receiver.height });
  return axis === 'y' ? { x: span.from, y: at, width: span.to - span.from, height: 0 } : { x: at, y: span.from, width: 0, height: span.to - span.from };
}

// The insertion line's reference, neighbour and side as shown (spec drag-reorder-canvas, Problems in Pager 5): a
// neighbour on another line of children is none; at the end of a line (the slot's child begins the next line) the
// line is drawn after the child before it when the pointer is on that child's line; in a parent that shows its
// children reversed, before in the document is after as shown.
export function shownAnchor(axis: 'x' | 'y', reversed: boolean, reference: Box, neighbour: Box | null, placement: 'before' | 'after', pointer: { readonly x: number; readonly y: number } | null): { reference: Box; neighbour: Box | null; placement: 'before' | 'after' } {
  let anchor = { reference, neighbour, placement };
  if (neighbour !== null && !sameLine(reference, neighbour, axis)) {
    const cross = pointer === null ? null : axis === 'x' ? pointer.y : pointer.x;
    const onNeighbour = cross !== null && (axis === 'x' ? cross >= neighbour.y && cross <= neighbour.y + neighbour.height : cross >= neighbour.x && cross <= neighbour.x + neighbour.width);
    anchor = onNeighbour ? { reference: neighbour, neighbour: null, placement: placement === 'before' ? 'after' : 'before' } : { reference, neighbour: null, placement };
  }
  return reversed ? { ...anchor, placement: anchor.placement === 'before' ? 'after' : 'before' } : anchor;
}

// The sibling an insertion line is drawn against, and its neighbour on that side: the proposal's own reference
// beside a sibling; inside a container, the child at the slot (before it) or the last child (after it); none for a
// refused proposal or a container with no other child, which shows its outline alone.
export function lineAnchor(proposal: DropProposal, siblings: readonly string[]): { reference: string; neighbour: string | null; placement: 'before' | 'after' } | null {
  if (proposal.refused) return null;
  if (proposal.placement !== 'inside') {
    const at = siblings.indexOf(proposal.reference);
    return { reference: proposal.reference, neighbour: siblings[proposal.placement === 'before' ? at - 1 : at + 1] ?? null, placement: proposal.placement };
  }
  const slot = siblings[proposal.index];
  if (slot !== undefined) return { reference: slot, neighbour: siblings[proposal.index - 1] ?? null, placement: 'before' };
  const last = siblings.at(-1);
  return last === undefined ? null : { reference: last, neighbour: null, placement: 'after' };
}

interface DropLayout {
  readonly line: Box | null;
  readonly receiver: Box;
  readonly label: { readonly box: Box; readonly placement: Placement } | null;
}

// The hand's aim as a drop (spec hand-keyboard-move: "the same indicator a mouse drag draws"): the held element is
// dragged, the aim is a slot inside its receiver, and the move's refusal of the aim, if any, is the drop's.
export function handDrop(hand: HandState): DropView {
  const { parent, index } = hand.aim;
  return { dragged: [hand.held], inserting: null, proposal: { parent, index, placement: 'inside', reference: parent, refused: false }, refusal: hand.refusal, levels: 0, side: null, at: null };
}

// The drop indicator of the drag in progress (spec drag-reorder-canvas, "Visual feedback", and Problems in Pager 3):
// the insertion line where the dragged nodes will land, the receiving parent's outline, and the label naming the
// receiver and the position ("Drop in Hero · position 1 of 3", DESIGN.md "Canvas", drag), placed by the label rule
// next to the line, never at the receiver's far corner. A proposal that the command would refuse (a creation drag's,
// the hand's aim) is drawn refused (spec palette-drag-insert, Problems in Pager 3). A drag's proposal drawn is the one
// of the level the level keys set (drag-session.ts), redrawn as soon as a key changes it.
function DropIndicator({ view }: { readonly view: DropView }) {
  const document = useEditorState((s) => s.document);
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DropLayout | null>(null);
  const { dragged } = view;
  const armed = view.side?.armed === true ? view.side : null;
  const refusedHere = armed !== null ? armed.refusal !== null : view.refusal !== null;
  const proposal = useMemo(() => (view.proposal !== null && refusedHere ? { ...view.proposal, refused: true } : view.proposal), [view.proposal, refusedHere]);
  const sideTarget = armed?.offer.target ?? null;
  const sideOffer = armed?.offer ?? null;
  // where the pointer is, for the line at the end of a line of children (shownAnchor)
  const pointerAt = view.at;
  const words = dragWords(document, view);
  const receiver = proposal === null ? null : (locate(document, proposal.parent)?.node ?? null);
  const siblings = receiver === null ? [] : receiver.children.filter((c) => !dragged.includes(c.id));

  useEffect(() => {
    let request = 0;
    const parent = proposal === null ? null : (locate(document, proposal.parent)?.node ?? null);
    if (proposal === null || parent === null) {
      request = requestAnimationFrame(() => setLayout(null));
      return () => cancelAnimationFrame(request);
    }
    const siblings = parent.children.filter((c) => !dragged.includes(c.id));
    const anchor = lineAnchor(proposal, siblings.map((c) => c.id));
    const measure = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const local = (b: Box | null): Box | null => (b === null ? null : { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height });
        // a confirmed side drop: the target is the receiver, the line runs along its side edge
        const target = sideTarget === null ? null : local(nodeBox(iframe, sideTarget));
        const box = target ?? local(nodeBox(iframe, proposal.parent));
        const reference = anchor === null ? null : local(nodeBox(iframe, anchor.reference));
        const next = anchor?.neighbour == null ? null : local(nodeBox(iframe, anchor.neighbour));
        if (box && (target !== null || anchor === null || reference)) {
          // the line between the neighbours as shown, across the line of children they are on when there are several
          const axis = flowAxis(iframe, proposal.parent);
          const laid = siblings.flatMap((c) => {
            const b = local(nodeBox(iframe, c.id));
            return b === null ? [] : [{ box: b }];
          });
          const lines = linesOf(laid, axis);
          const pointer = pointerAt === null ? null : local({ x: pointerAt.x, y: pointerAt.y, width: 0, height: 0 });
          const shown = anchor !== null && reference ? shownAnchor(axis, flowReversed(iframe, proposal.parent), reference, next, anchor.placement, pointer) : null;
          const across = shown === null || lines.length < 2 ? null : lineExtent(lines.find((l) => l.some((i) => sameLine(i.box, shown.reference, axis))) ?? [{ box: shown.reference }], axis);
          const line = target !== null && sideOffer !== null ? sideLine(target, sideOffer) : shown !== null ? dropLine(axis, box, shown.reference, shown.neighbour, shown.placement, across) : null;
          const size = label.current ? { width: label.current.offsetWidth, height: label.current.offsetHeight } : null;
          const gap = parseFloat(getComputedStyle(layer.current as HTMLDivElement).getPropertyValue('--space-2')) || 0;
          const content = contentBoxes(iframe).map((b) => local(b) as Box);
          const placed = size === null ? null : placeLabel(line ?? box, size, gap, content, { x: 0, y: 0, width: origin.width, height: origin.height });
          const nextLayout: DropLayout = { line, receiver: box, label: placed };
          setLayout((before) => (same(before, nextLayout) ? before : nextLayout));
        }
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [proposal, dragged, document, sideTarget, sideOffer, pointerAt]);

  if (proposal === null || receiver === null) return <div ref={layer} className="chrome__drop" />;
  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
  // refused over the dragged subtree; into a container that shows no line (it has no other child); or between siblings
  const state = proposal.refused ? 'refused' : armed !== null ? 'side' : lineAnchor(proposal, siblings.map((c) => c.id)) === null ? 'into' : 'between';
  return (
    <div ref={layer} className="chrome__drop" data-chrome="drop">
      {layout ? <div className={`chrome__receiver is-${state}`} data-chrome="drop-receiver" data-state={state} style={at(layout.receiver)} /> : null}
      {layout?.line ? <div className={`chrome__drop-line is-${layout.line.height === 0 ? 'across' : 'down'}${proposal.refused ? ' is-refused' : ''}`} data-chrome="drop-line" style={lineStyle(layout.line)} /> : null}
      <div
        ref={label}
        className={`chrome__label${layout?.label ? '' : ' is-measuring'}${proposal.refused ? ' is-refused' : ''}`}
        data-chrome="drop-label"
        data-placement={layout?.label?.placement}
        style={layout?.label ? { left: layout.label.box.x, top: layout.label.box.y } : undefined}
      >
        <span className="chrome__name">{words === null ? null : t(words.key, words.params)}</span>
      </div>
    </div>
  );
}

// The ghost of a palette tile's creation drag (spec palette-drag-insert, Problems in Pager 4): a chip with the new
// element's icon and name, at drag.ghostOffset from the pointer wherever it is in the window (over the palette, the
// stage or the page), so a creation drag never looks like the move of an element of the same name. Drawn over the
// whole window (a portal on the body), never a pointer target; refused (off the page, or where the element is
// refused) it wears the refusal's colour.
function Ghost({ inserting, at, refused, note = null, ref }: { readonly inserting: Inserting; readonly at: { readonly x: number; readonly y: number }; readonly refused: boolean; readonly note?: GhostNote | null; readonly ref?: Ref<HTMLDivElement> }) {
  const t = useT();
  const looked = insertingLook(inserting);
  if (looked === null) return null;
  return createPortal(
    <div className="chrome-ghost-stack" style={{ left: at.x + GHOST_OFFSET[0], top: at.y + GHOST_OFFSET[1] }}>
      <div ref={ref} className={`chrome-ghost${refused ? ' is-refused' : ''}`} data-chrome="ghost" data-entry={looked.id}>
        <Icon name={looked.icon} size="sm" />
        <span className="chrome-ghost__label">{typeof looked.name === 'string' ? looked.name : t(looked.name.key)}</span>
      </div>
      <Note note={note} />
    </div>,
    document.body,
  );
}

// What the ghost says under its chip about a side drop (spec drag-layout, row 5): offered, how to confirm it (a hint);
// confirmed, what the release creates (the pill, with the wrapper's glyph), or the refusal its wrap would meet.
export interface GhostNote {
  readonly kind: 'hint' | 'pill';
  readonly words: Message;
  readonly wrapper: 'row' | 'column';
  readonly refused: boolean;
}
function Note({ note }: { readonly note: GhostNote | null }) {
  const t = useT();
  if (note === null) return null;
  return (
    <div className={`chrome__${note.kind}${note.refused ? ' is-refused' : ''}`} data-chrome={note.kind === 'pill' ? 'side-pill' : 'side-hint'}>
      {note.kind === 'pill' ? <Icon name={note.wrapper === 'row' ? GLYPHS.sideRow : GLYPHS.sideColumn} size="sm" /> : null}
      {t(note.words.key, note.words.params)}
    </div>
  );
}
// the note of the drag in progress: the side drop it offers or has confirmed, if any
export function ghostNote(document: DocumentJson, view: DragView): GhostNote | null {
  const side = view.side;
  if (side === null) return null;
  if (!side.armed) return { kind: 'hint', words: message('canvas.drop.sideHint'), wrapper: side.offer.wrapper, refused: false };
  return { kind: 'pill', words: side.refusal ?? sideWords(document, side, view.dragged, view.inserting), wrapper: side.offer.wrapper, refused: side.refusal !== null };
}

// The ghost of an element drag (spec drag-layout, row 4): the dragged element's icon and name ("3 elements" for
// several) beside the pointer, as a creation drag's ghost, while the element itself keeps its place, outlined dashed.
function MovingGhost({ dragged, at, refused, note }: { readonly dragged: readonly NodeId[]; readonly at: { readonly x: number; readonly y: number }; readonly refused: boolean; readonly note: GhostNote | null }) {
  const t = useT();
  const first = useEditorState((s) => (dragged[0] === undefined ? null : (locate(s.document, dragged[0])?.node ?? null)));
  if (first === null) return null;
  return createPortal(
    <div className="chrome-ghost-stack" style={{ left: at.x + GHOST_OFFSET[0], top: at.y + GHOST_OFFSET[1] }}>
      <div className={`chrome-ghost${refused ? ' is-refused' : ''}`} data-chrome="ghost" data-node={first.id}>
        <Icon name={elementIcon(first.type) ?? GLYPHS.folder} size="sm" />
        <span className="chrome-ghost__label">{dragged.length > 1 ? t('canvas.selectedCount', { count: dragged.length }) : first.name}</span>
      </div>
      <Note note={note} />
    </div>,
    document.body,
  );
}

// The elements a drop has just placed flash for drop.flashDuration (spec drag-layout, row 10): an outline in the drop
// colour that fades, drawn over each of them; at once gone when the person asks for reduced motion.
function DropFlash() {
  const drop = useSyncExternalStore(lastDrop.subscribe, lastDrop.get);
  const [boxes, setBoxes] = useState<{ readonly id: number; readonly boxes: readonly Box[] } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (drop === null) return;
    const iframe = canvasFrame();
    const origin = layer.current?.parentElement?.getBoundingClientRect();
    if (!iframe || !origin) return;
    const found = drop.nodes.map((id) => nodeBox(iframe, id)).filter((b): b is Box => b !== null).map((b) => ({ x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height }));
    setBoxes({ id: drop.id, boxes: found });
    const done = setTimeout(() => setBoxes((now) => (now?.id === drop.id ? null : now)), FLASH_MS);
    return () => clearTimeout(done);
  }, [drop]);
  return (
    <div ref={layer} className="chrome__flashes">
      {boxes?.boxes.map((b, i) => <div key={`${boxes.id}-${i}`} className="chrome__flash" data-chrome="drop-flash" style={{ left: b.x, top: b.y, width: b.width, height: b.height, animationDuration: `${FLASH_MS}ms` }} />)}
    </div>
  );
}

// The ghost of a creation drag Escape cancelled (pointer.ts, ghostReturn) goes back to the tile it came from and fades
// out over GHOST_RETURN_MS (spec drag-level-keys-escape, Problems in Pager 4), then is drawn no more; at once when the
// person asks for reduced motion.
function ReturningGhost({ view }: { readonly view: GhostReturn }) {
  const ghost = useRef<HTMLDivElement>(null);
  const [back, setBack] = useState(false);
  useLayoutEffect(() => {
    const element = ghost.current;
    if (element === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const way = element.animate(
      [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${view.to.x - view.from.x}px, ${view.to.y - view.from.y}px)`, opacity: 0 },
      ],
      { duration: reduced ? 0 : GHOST_RETURN_MS, easing: 'ease-in', fill: 'forwards' },
    );
    let playing = true;
    way.finished.then(
      () => {
        if (playing) setBack(true);
      },
      () => {},
    );
    return () => {
      playing = false;
      way.cancel();
    };
  }, [view]);
  return back ? null : <Ghost ref={ghost} inserting={view.inserting} at={view.from} refused={false} />;
}

// Where a selected node is drawn: itself, or, when it or an ancestor is hidden (spec hide-element, Problems in Pager
// 1), the nearest ancestor that is shown, with the node marked hidden. As one text, so the store's selector returns
// the same value while nothing changes.
function drawnTargets(document: DocumentJson, selection: readonly NodeId[]): string {
  return JSON.stringify(
    selection.map((id) => {
      const chain: DocNode[] = [];
      for (let at = locate(document, id); at !== null; at = at.parent === null ? null : locate(document, at.parent.id)) chain.push(at.node);
      const outermost = chain.map((n) => n.hidden === true).lastIndexOf(true);
      return outermost < 0 ? { id, hidden: false } : { id: chain[outermost + 1]?.id ?? id, hidden: true };
    }),
  );
}

export function CanvasChrome() {
  const selection = useEditorState((s) => s.selection);
  const targetsText = useEditorState((s) => drawnTargets(s.document, s.selection));
  const targets = useMemo(() => JSON.parse(targetsText) as { id: NodeId; hidden: boolean }[], [targetsText]);
  // the drag in progress (pointer.ts): the drop indicator is drawn, the selection's label hides and its outline turns
  // into the dashed outline of the source (Problems in Pager 1)
  const dragging = useSyncExternalStore(drag.subscribe, drag.get);
  // the ghost of a creation drag Escape cancelled, on its way back to its tile
  const returning = useSyncExternalStore(ghostReturn.subscribe, ghostReturn.get);
  // the element the keyboard's hand holds: its aim is drawn as a drag's drop (spec hand-keyboard-move, "Visual
  // feedback")
  const hand = useEditorState(heldHand);
  const aiming = useMemo(() => (hand === null ? null : handDrop(hand)), [hand]);
  const dropping: DropView | null = dragging ?? aiming;
  // what the ghost says under its chip about a side drop
  const documentNow = useEditorState((s) => s.document);
  const note = dragging === null ? null : ghostNote(documentNow, dragging);
  // the primary selected node, read as the store holds it (a node object is replaced only when it changes)
  const node = useEditorState((s) => (s.selection[0] === undefined ? null : (locate(s.document, s.selection[0])?.node ?? null)));
  // the one selected element can be resized: not the page, not locked (itself or an ancestor), shown
  const resizable = useEditorState((s) => {
    if (s.selection.length !== 1 || s.selection[0] === undefined) return false;
    for (let at = locate(s.document, s.selection[0]), first = true; at !== null; at = at.parent === null ? null : locate(s.document, at.parent.id), first = false) {
      if (first && at.parent === null) return false;
      if (at.node.locked === true || at.node.hidden === true) return false;
    }
    return true;
  });
  const hovered = useSyncExternalStore(hover.subscribe, hover.get);
  // Alt held: the distances from the selection to the hovered element are drawn (spec hover-measure)
  const altHeld = useSyncExternalStore(measuring.subscribe, measuring.get);
  // an Edit on canvas mode is on (canvas/edit-mode.ts)
  const editingOnCanvas = useEditorState((s) => editMode(s.ui) !== NO_MODE);
  const drawnBand = useSyncExternalStore(band.subscribe, band.get);
  // the text edited in place (text-edit.ts): its outline and label wear the text editing mode, so the edit never looks
  // like a plain selection (spec text-edit-inline, Problems in Pager 2; DESIGN.md "Canvas", text)
  const editing = useEditorState((s) => s.ui.textEdit.node !== null && s.selection.length === 1 && s.selection[0] === s.ui.textEdit.node);
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  // the text toolbar while a text is edited in place (text-toolbar.tsx)
  const bar = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY);

  useEffect(() => {
    let request = 0;
    // nothing selected, hovered or banded: nothing to measure, and the last layout is dropped
    if (selection.length === 0 && hovered === null && drawnBand === null) {
      request = requestAnimationFrame(() => setLayout(EMPTY));
      return () => cancelAnimationFrame(request);
    }
    let placedFor = '';
    let placed: Layout['label'] = null;
    let placedToolbar: Layout['toolbar'] = null;
    const measure = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const local = (b: Box | null): Box | null => (b === null ? null : { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height });
        const selected = targets.map((target) => local(nodeBox(iframe, target.id))).filter((b): b is Box => b !== null);
        const union = selection.length > 1 ? unionOf(selected) : null;
        // the label belongs to the one selected node, or to the union of several
        const first = union ?? selected[0];
        const size = label.current ? { width: label.current.offsetWidth, height: label.current.offsetHeight } : null;
        const tools = editing && bar.current ? { width: bar.current.offsetWidth, height: bar.current.offsetHeight } : null;
        // the label is placed again only when its element or its size moved: reading the page's content is the slow part
        const key = JSON.stringify([first, size, tools]);
        if (first === undefined || size === null) {
          placed = null;
          placedToolbar = null;
        } else if (key !== placedFor) {
          const gap = parseFloat(getComputedStyle(layer.current as HTMLDivElement).getPropertyValue('--space-2')) || 0;
          // the selection's label always above its element; while a text is edited in place, its toolbar sits above
          // its label and the two are placed as one (DESIGN.md "Canvas", text)
          const whole = tools === null ? size : { width: Math.max(size.width, tools.width), height: tools.height + gap + size.height };
          const spot = placeAbove(first, whole, gap, { x: 0, y: 0, width: origin.width, height: origin.height });
          placed = tools === null ? spot : { placement: spot.placement, box: { x: spot.box.x, y: spot.box.y + tools.height + gap, ...size } };
          placedToolbar = tools === null ? null : { x: spot.box.x, y: spot.box.y };
        }
        placedFor = key;
        const hoveredBox = hovered !== null && !selection.includes(hovered as (typeof selection)[number]) ? local(nodeBox(iframe, hovered)) : null;
        const style = getComputedStyle(layer.current as HTMLDivElement);
        const single = selection.length === 1 ? selected[0] : undefined;
        const rotate = single === undefined ? null : rotateSpot(single, origin, parseFloat(style.getPropertyValue('--space-6')) || 0, parseFloat(style.getPropertyValue('--space-4')) || 0);
        // the hovered element's size in CSS px, and, with Alt held, its distances to the one selected element
        const zoom = iframe.currentCSSZoom > 0 ? iframe.currentCSSZoom : 1;
        const hoverSize = hoveredBox === null ? null : { x: hoveredBox.x, y: hoveredBox.y + hoveredBox.height, width: Math.round(hoveredBox.width / zoom), height: Math.round(hoveredBox.height / zoom) };
        const ancestor = hovered !== null && single !== undefined && selection[0] !== undefined && holdsNode(iframe, hovered, selection[0]);
        const inner = ancestor && hovered !== null ? local(innerBox(iframe, hovered)) : null;
        const distances = altHeld && hoveredBox !== null && single !== undefined ? distancesOf(single, hoveredBox, inner, zoom) : [];
        const next: Layout = { selected, union, hovered: hoveredBox, label: placed, toolbar: placedToolbar, band: local(drawnBand), rotate, hoverSize, distances };
        setLayout((before) => (same(before, next) ? before : next));
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [selection, targets, hovered, node, drawnBand, editing, altHeld]);

  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
  const shown = selection.length === 0 && hovered === null && drawnBand === null ? EMPTY : layout;
  return (
    <div className="chrome" ref={layer} data-canvas-chrome>
      <GridOverlay />
      <ViewOverlays />
      {shown.hovered ? <div className="chrome__hover" data-chrome="hover" style={at(shown.hovered)} /> : null}
      {shown.hoverSize ? (
        <div className="chrome__size" data-chrome="hover-size" style={{ left: shown.hoverSize.x, top: shown.hoverSize.y }}>
          {t('canvas.measure.size', { width: shown.hoverSize.width, height: shown.hoverSize.height })}
        </div>
      ) : null}
      {shown.distances.map((d, i) => (
        <div key={i} className={`chrome__distance chrome__distance--${d.box.width === 0 ? 'down' : 'across'}`} data-chrome="distance" data-value={d.value} style={at(d.box)}>
          <span className="chrome__distance-label">{t('canvas.measure.distance', { value: d.value })}</span>
        </div>
      ))}
      {drawnBand !== null && shown.band ? <div className="chrome__band" data-chrome="band" style={at(shown.band)} /> : null}
      {shown.selected.map((b, i) => (
        <div
          key={i}
          className={`chrome__selection${dropping && dropping.dragged.length > 0 ? ' is-source' : ''}${editing ? ' is-editing' : ''}${targets[i]?.hidden === true ? ' is-hidden-node' : ''}`}
          data-chrome="selection"
          style={at(b)}
        />
      ))}
      {dropping ? <DropIndicator view={dropping} /> : null}
      {dragging?.inserting != null ? <Ghost inserting={dragging.inserting} at={dragging.at} refused={dragging.side?.armed === true ? dragging.side.refusal !== null : dragging.proposal === null || dragging.refusal !== null} note={note} /> : null}
      {dragging !== null && dragging.inserting === null && dragging.dragged.length > 0 ? <MovingGhost dragged={dragging.dragged} at={dragging.at} refused={dragging.side?.armed === true ? dragging.side.refusal !== null : dragging.proposal === null || dragging.proposal.refused} note={note} /> : null}
      <DropFlash />
      {returning !== null && dragging === null ? <ReturningGhost key={returning.id} view={returning} /> : null}
      {shown.union && selection.length > 1 ? <div className="chrome__union" data-chrome="union" style={at(shown.union)} /> : null}
      {/* the resize handles, but while an Edit on canvas mode draws its own (edit-handles.tsx) */}
      {resizable && shown.selected[0] && !dropping && !editing && !editingOnCanvas
        ? RESIZE_HANDLES.filter(isDoorBuilt).map((entry) => {
            const handle = entry.door.kind === 'canvas-handle' ? entry.door.handle : '';
            const box = shown.selected[0] as Box;
            return <div key={entry.ref} className="chrome__handle" data-door={entry.ref} data-resize-handle={handle} data-chrome="handle" style={handlePoint(handle, box)} />;
          })
        : null}
      {resizable && shown.selected[0] && !dropping && !editing && !editingOnCanvas && ROTATE_HANDLE !== null && isDoorBuilt(ROTATE_HANDLE) ? (
        <div className="chrome__rotate" data-door={ROTATE_HANDLE.ref} data-rotate-handle="" data-chrome="handle" title={t(ROTATE_HANDLE.door.labelKey as MessageId)} style={shown.rotate === null ? undefined : { left: shown.rotate.x, top: shown.rotate.y }} />
      ) : null}
      {/* the handles of the Edit on canvas mode on the one selected element (edit-handles.tsx) */}
      {resizable && shown.selected[0] && node !== null && !dropping && !editing ? <EditHandles node={node.id} box={shown.selected[0]} /> : null}
      {selection.length > 1 ? (
        <div
          ref={label}
          className={`chrome__label${shown.label ? '' : ' is-measuring'}`}
          data-chrome="label"
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          <span className="chrome__name">{t('canvas.selectedCount', { count: selection.length })}</span>
        </div>
      ) : node !== null ? (
        <div
          ref={label}
          className={`chrome__label is-target${shown.label ? '' : ' is-measuring'}${dropping ? ' is-hidden' : ''}${editing ? ' is-editing' : ''}`}
          data-chrome="label"
          data-label-for={node.id}
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          {editing ? (
            <span className="chrome__name">{t('canvas.editingText', { name: node.name })}</span>
          ) : (
            <>
              <span className="chrome__name">{node.name}</span>
              <small className="chrome__tag">{node.tag ?? ''}</small>
              {targets[0]?.hidden === true ? <small className="chrome__flag">{t('canvas.hiddenFlag')}</small> : null}
            </>
          )}
        </div>
      ) : null}
      {editing && node !== null ? <TextToolbar bar={bar} className={shown.toolbar ? '' : 'is-measuring'} style={shown.toolbar ? { left: shown.toolbar.x, top: shown.toolbar.y } : undefined} /> : null}
    </div>
  );
}
