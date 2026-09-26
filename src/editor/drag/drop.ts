// The drop proposal of a drag on the canvas (ARCHITECTURE.md): where the dragged nodes would land for a pointer
// position, from the nodes under the pointer, their boxes on the screen and the flow of their parents (spec
// drag-reorder-canvas, "Hit zones and thresholds"). Pure: the pointer owner measures the page through the coordinates
// module and hands the measures in; the constants are the manifest's (interactions.json).
//
// - Over the dragged nodes or their descendants the proposal is refused (spec drag-drop-inside, Problems in Pager 1):
//   nothing lands there, and a release asks element.moveTo for the deepest of them, which it refuses.
// - Otherwise the target is the deepest node under the pointer outside the dragged nodes and their descendants.
// - Along its parent's flow axis a leaf splits at drop.leafSplit: before it, else after it; a leaf is never a
//   receiver. A container keeps an edge band at each end (min(drop.emptyEdgeMax, drop.emptyEdgeFraction × S) when
//   empty, min(clamp(drop.edgeFraction × S, drop.edgeMin, drop.edgeMax), drop.edgeCapFraction × S) with children, in
//   the page's CSS pixels, so they scale with the zoom): before or after it there. Between its bands, and on the page
//   root's own background, the drop is inside it, at the slot of the pointer, read in two dimensions from its
//   children's real boxes (spec drag-reorder-canvas, Problems in Pager 5; `slotAt`): the line of them the pointer is
//   on (a row along an x flow, a column along a y flow; else the nearest), then its place along that line as shown.
// - Before and after are read as shown, along the parent's flow; where the parent shows its children against the
//   document's order (a row-reverse or column-reverse flex), before a node as shown is after it in the document.
// - Escape ladder: within min(drop.escapeBandMax, S / 2 − drop.escapeBandInset) screen pixels of an ancestor's edge,
//   never less than drop.escapeBandFloor on an ancestor at least drop.escapeBandFloorExtent CSS pixels long (Problems in
//   Pager 4), plus drop.escapeBandSlop, the drop is before or after that ancestor. Where several ancestors share the
//   edge the innermost one wins: the level keys of drag-level-keys-escape climb further out (Problems in Pager 4).
//   A container target's own bands come first; a leaf's halves come last, since they cover all of it.
// The proposal's index counts the receiving parent's children without the dragged nodes: it is the position the
// first dragged node takes (element.moveTo's index).
import { locate, walk, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import { lineExtent, linesOf } from '../../core/geometry/lines.ts';
import { manifest } from '../../manifest/runtime.ts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type Axis = 'x' | 'y';

// What the proposal reads of the page, in screen pixels.
export interface DropSpace {
  // screen pixels per CSS pixel of the page
  readonly zoom: number;
  box(id: NodeId): Box | null;
  // the axis a node lays its children along
  axis(id: NodeId): Axis;
  // whether a node shows its children against the document's order along that axis (a reverse flex); none: false
  reversed?(id: NodeId): boolean;
}

// A child of a container as it is laid out: its box, and its place among the container's children the proposal
// counts (the dragged ones left out).
export interface Laid {
  readonly id: NodeId;
  readonly box: Box;
  readonly order: number;
}

// The slot of a point among a container's children, in two dimensions (spec drag-reorder-canvas, Problems in Pager 5):
// the line of them the point is on (core/geometry/lines.ts), else the nearest, then before the first child of that
// line whose centre lies past the point as shown, or after the line's last. Where the container shows its children
// against the document's order, before a child as shown is after it in the document.
export function slotAt(laid: readonly Laid[], point: { readonly x: number; readonly y: number }, axis: Axis, reversed: boolean): number {
  if (laid.length === 0) return 0;
  const cross = axis === 'x' ? point.y : point.x;
  const main = axis === 'x' ? point.x : point.y;
  const distance = (line: readonly Laid[]) => {
    const { from, to } = lineExtent(line, axis);
    return cross < from ? from - cross : cross > to ? cross - to : 0;
  };
  const line = linesOf(laid, axis).reduce((best, l) => (distance(l) < distance(best) ? l : best));
  const centre = (k: Laid) => (axis === 'x' ? k.box.x + k.box.width / 2 : k.box.y + k.box.height / 2);
  const past = line.find((k) => centre(k) > main);
  const last = line[line.length - 1] as Laid;
  if (reversed) return past !== undefined ? past.order + 1 : last.order;
  return past !== undefined ? past.order : last.order + 1;
}

// Where the dragged nodes would land: in `parent` at `index`; before or after `reference` (a sibling), or inside
// `reference` (the parent itself) at a slot. A refused proposal is the pointer over the dragged nodes' own subtree:
// its parent is the deepest node of that subtree under the pointer, which element.moveTo refuses.
export interface DropProposal {
  readonly parent: NodeId;
  readonly index: number;
  readonly placement: 'before' | 'after' | 'inside';
  readonly reference: NodeId;
  readonly refused: boolean;
}

export interface DropZones {
  readonly leafSplit: number;
  readonly emptyEdgeMax: number;
  readonly emptyEdgeFraction: number;
  readonly edgeFraction: number;
  readonly edgeMin: number;
  readonly edgeMax: number;
  readonly edgeCapFraction: number;
  readonly escapeBandMax: number;
  readonly escapeBandInset: number;
  readonly escapeBandSlop: number;
  readonly escapeBandFloor: number;
  readonly escapeBandFloorExtent: number;
}

function constant(id: string): number {
  const value = manifest.interactions.constants.find((c) => c.id === id)?.value;
  if (typeof value !== 'number') throw new Error(`interactions.json has no number ${id}`);
  return value;
}
export const DROP_ZONES: DropZones = {
  leafSplit: constant('drop.leafSplit'),
  emptyEdgeMax: constant('drop.emptyEdgeMax'),
  emptyEdgeFraction: constant('drop.emptyEdgeFraction'),
  edgeFraction: constant('drop.edgeFraction'),
  edgeMin: constant('drop.edgeMin'),
  edgeMax: constant('drop.edgeMax'),
  edgeCapFraction: constant('drop.edgeCapFraction'),
  escapeBandMax: constant('drop.escapeBandMax'),
  escapeBandInset: constant('drop.escapeBandInset'),
  escapeBandSlop: constant('drop.escapeBandSlop'),
  escapeBandFloor: constant('drop.escapeBandFloor'),
  escapeBandFloorExtent: constant('drop.escapeBandFloorExtent'),
};

// a container's own edge band, in screen pixels: the zone table's, in CSS pixels scaled by the zoom
export function edgeBand(extent: number, empty: boolean, zoom: number, z: DropZones): number {
  const css = extent / zoom;
  const band = empty ? Math.min(z.emptyEdgeMax, z.emptyEdgeFraction * css) : Math.min(Math.min(Math.max(z.edgeFraction * css, z.edgeMin), z.edgeMax), z.edgeCapFraction * css);
  return band * zoom;
}

// an ancestor's escape band, in screen pixels, for its extent on the screen; the floor holds for an element at least
// drop.escapeBandFloorExtent CSS pixels long, at any zoom
export function escapeBand(extent: number, zoom: number, z: DropZones): number {
  const band = Math.min(z.escapeBandMax, extent / 2 - z.escapeBandInset);
  return (extent / zoom >= z.escapeBandFloorExtent ? Math.max(band, z.escapeBandFloor) : Math.max(band, 0)) + z.escapeBandSlop;
}

export function proposeDrop(
  document: DocumentJson,
  isContainer: (type: string) => boolean,
  dragged: readonly NodeId[],
  under: readonly string[],
  point: { readonly x: number; readonly y: number },
  space: DropSpace,
  z: DropZones = DROP_ZONES,
): DropProposal | null {
  const moving = new Set<string>();
  for (const id of dragged) {
    const at = locate(document, id);
    if (at) for (const inner of walk(at.node)) moving.add(inner.id);
  }
  // over the dragged nodes' own subtree: refused, whatever lies under it (spec drag-drop-inside, Problems in Pager 1)
  const deepest = under[0];
  if (deepest !== undefined && moving.has(deepest)) return { parent: deepest as NodeId, index: 0, placement: 'inside', reference: deepest as NodeId, refused: true };
  const hit = under.find((id) => !moving.has(id));
  const at = hit === undefined ? null : locate(document, hit as NodeId);
  if (at === null) return null;

  // before or after a node as shown, in the document's order: swapped in a parent that shows its children reversed
  const place = (id: NodeId, shown: 'before' | 'after'): DropProposal | null => {
    const node = locate(document, id);
    if (!node?.parent) return null;
    const placement = space.reversed?.(node.parent.id) === true ? (shown === 'before' ? 'after' : 'before') : shown;
    const siblings = node.parent.children.filter((c) => !dragged.includes(c.id));
    const index = siblings.findIndex((c) => c.id === id) + (placement === 'after' ? 1 : 0);
    return { parent: node.parent.id, index, placement, reference: id, refused: false };
  };
  // inside a container, at the slot of the pointer among its children (without the dragged ones), in two dimensions
  const inside = (id: NodeId): DropProposal | null => {
    const node = locate(document, id);
    if (!node) return null;
    const laid = node.node.children
      .filter((c) => !dragged.includes(c.id))
      .flatMap((c, order) => {
        const box = space.box(c.id);
        return box ? [{ id: c.id, box, order }] : [];
      });
    return { parent: id, index: slotAt(laid, point, space.axis(id), space.reversed?.(id) === true), placement: 'inside', reference: id, refused: false };
  };
  // the page root under the pointer (its own background): inside it
  if (at.parent === null) return inside(at.node.id);
  // where the pointer is along a node's extent in its parent's flow, or null when it is not measured
  const along = (id: NodeId, parent: NodeId) => {
    const box = space.box(id);
    if (!box) return null;
    const axis = space.axis(parent);
    return axis === 'x' ? { pos: point.x - box.x, extent: box.width } : { pos: point.y - box.y, extent: box.height };
  };

  // the target container's own bands; between them the drop is inside it (drag-drop-inside)
  if (isContainer(at.node.type)) {
    const m = along(at.node.id, at.parent.id);
    if (!m) return null;
    const band = edgeBand(m.extent, at.node.children.length === 0, space.zoom, z);
    if (m.pos < band) return place(at.node.id, 'before');
    if (m.pos > m.extent - band) return place(at.node.id, 'after');
    return inside(at.node.id);
  }
  // a leaf: the escape ladder over its ancestors, the innermost first, then its halves
  for (let up = locate(document, at.parent.id); up?.parent; up = locate(document, up.parent.id)) {
    const m = along(up.node.id, up.parent.id);
    if (!m) continue;
    const band = escapeBand(m.extent, space.zoom, z);
    if (m.pos < band) return place(up.node.id, 'before');
    if (m.pos > m.extent - band) return place(up.node.id, 'after');
  }
  const m = along(at.node.id, at.parent.id);
  if (!m) return null;
  return place(at.node.id, m.pos < m.extent * z.leafSplit ? 'before' : 'after');
}

// The side drop (spec drag-layout, row 5; wrap-row-column, "Side band"): over an element that fills its parent's cross
// axis, a pointer in one of its side strips offers to put what the drag brings beside it, in a new Row (the parent
// lays its children vertically: the strips are the element's left and right) or a new Column (a row parent: its top
// and bottom). Positioning stays the drop everywhere else (the user's correction: a drag positions first). The element
// is the deepest node under the pointer outside the dragged nodes, and only it: an ancestor's edge never offers a side
// drop (the pointer over a child is over that child); never the page root, never a child of a grid or of a wrapping
// flex. In screen pixels: at least wrap.sideTargetMin long across, filling wrap.sideFill of its parent, the strip
// min(wrap.sideBandMax, wrap.sideBandFraction × that length) from the edge, and clear of the two other edges by
// min(wrap.sideEdgeExclusion, a quarter of the element). The pointer owner confirms the offer (wrap.sideDwell, none:
// at once) before a release wraps.
export interface SideOffer {
  readonly target: NodeId;
  readonly side: 'before' | 'after';
  readonly wrapper: 'row' | 'column';
}

export interface SideSpace {
  box(id: NodeId): Box | null;
  flow(id: NodeId): 'vertical' | 'horizontal' | null;
}

export interface SideZones {
  readonly bandMax: number;
  readonly bandFraction: number;
  readonly targetMin: number;
  readonly fill: number;
  readonly edgeExclusion: number;
}
export const SIDE_ZONES: SideZones = {
  bandMax: constant('wrap.sideBandMax'),
  bandFraction: constant('wrap.sideBandFraction'),
  targetMin: constant('wrap.sideTargetMin'),
  fill: constant('wrap.sideFill'),
  edgeExclusion: constant('wrap.sideEdgeExclusion'),
};
// how long the pointer stays in the same side band before its offer is confirmed, in milliseconds
export const SIDE_DWELL = constant('wrap.sideDwell');

export function offerSide(document: DocumentJson, dragged: readonly NodeId[], under: readonly string[], point: { readonly x: number; readonly y: number }, space: SideSpace, z: SideZones = SIDE_ZONES): SideOffer | null {
  const moving = new Set<string>();
  for (const id of dragged) {
    const at = locate(document, id);
    if (at) for (const inner of walk(at.node)) moving.add(inner.id);
  }
  const hit = under.find((id) => !moving.has(id));
  const at = hit === undefined ? null : locate(document, hit as NodeId);
  // an element right in the page root (a section, a header: a band of the page) takes no side drop: near its edge the
  // drop goes into it or beside it in the page, as everywhere
  if (at?.parent && locate(document, at.parent.id)?.parent != null) {
    const flow = space.flow(at.parent.id);
    const box = space.box(at.node.id);
    const parent = space.box(at.parent.id);
    if (flow === null || box === null || parent === null) return null;
    const across = flow === 'vertical' ? box.width : box.height;
    const room = flow === 'vertical' ? parent.width : parent.height;
    if (across < z.targetMin || across < z.fill * room) return null;
    // along the side bands' axis: the pointer's place across the element; the other axis keeps clear of its edges
    const pos = flow === 'vertical' ? point.x - box.x : point.y - box.y;
    const other = flow === 'vertical' ? point.y - box.y : point.x - box.x;
    const otherExtent = flow === 'vertical' ? box.height : box.width;
    // the other edges keep clear, by at most a quarter of the element, so a low element (a line of text) keeps its zones
    const clear = Math.min(z.edgeExclusion, otherExtent / 4);
    if (other < clear || other > otherExtent - clear || pos < 0 || pos > across) return null;
    const band = Math.min(z.bandMax, z.bandFraction * across);
    const wrapper = flow === 'vertical' ? 'row' : 'column';
    if (pos <= band) return { target: at.node.id, side: 'before', wrapper };
    if (pos >= across - band) return { target: at.node.id, side: 'after', wrapper };
  }
  return null;
}

// A drop on a Layers row (spec layers-drag, "Hit zones"): where the pointer is down the row, as a fraction of its
// height. The page root's row takes the drop inside, at its end; a container row is before its node in its top
// layers.dropBefore, after it below layers.dropAfter, inside it (at its end) between; a leaf row splits at
// layers.dropLeafSplit. A row of the dragged nodes' own subtree is refused, as on the canvas.
export interface RowZones {
  readonly before: number;
  readonly after: number;
  readonly leafSplit: number;
}
export const ROW_ZONES: RowZones = { before: constant('layers.dropBefore'), after: constant('layers.dropAfter'), leafSplit: constant('layers.dropLeafSplit') };

export function rowDrop(document: DocumentJson, isContainer: (type: string) => boolean, dragged: readonly NodeId[], row: NodeId, at: number, z: RowZones = ROW_ZONES): DropProposal | null {
  const target = locate(document, row);
  if (target === null) return null;
  for (const id of dragged) {
    const moving = locate(document, id);
    if (moving && [...walk(moving.node)].some((n) => n.id === row)) return { parent: row, index: 0, placement: 'inside', reference: row, refused: true };
  }
  const inside = (): DropProposal => ({ parent: row, index: target.node.children.filter((c) => !dragged.includes(c.id)).length, placement: 'inside', reference: row, refused: false });
  if (target.parent === null) return inside();
  const beside = (placement: 'before' | 'after'): DropProposal | null => {
    const parent = target.parent;
    if (parent === null) return null;
    const siblings = parent.children.filter((c) => !dragged.includes(c.id));
    return { parent: parent.id, index: siblings.findIndex((c) => c.id === row) + (placement === 'after' ? 1 : 0), placement, reference: row, refused: false };
  };
  if (isContainer(target.node.type)) return at < z.before ? beside('before') : at > z.after ? beside('after') : inside();
  return beside(at < z.leafSplit ? 'before' : 'after');
}
