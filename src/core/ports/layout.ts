// The layout port: where the canvas draws each node of the page it shows. The core never measures a page (it has no
// DOM); a handler that acts on what a gesture covers on the page (the marquee band) asks this port, and the editor
// gives the measurement of its canvas (src/editor/canvas/coordinates.ts, pageLayout). Tests pass boxes they choose.
import type { NodeId, Rect } from '../../generated/commands.ts';

export interface Layout {
  // the node's box in page pixels (from the top-left of the page, scroll included), or null when the canvas does not
  // draw it
  box(node: NodeId): Rect | null;
  // where the node's margin edge lies, in page pixels, from its parent's padding edges ('parent': what left, top, right
  // and bottom say once the parent is its containing block) or from the viewport's ('viewport': what they say for a
  // fixed element), with its computed width and height; null when the canvas does not draw it (specs absolute-free-drag,
  // keepVisualPlace; absolute-anchors)
  place(node: NodeId, within: 'parent' | 'viewport'): Place | null;
}

export interface Place {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

// A layout that draws nothing: the store's default when no canvas measures the page.
export const noLayout: Layout = {
  box: () => null,
  place: () => null,
};

// A layout of fixed boxes (and places), for tests.
export function fixedLayout(boxes: Readonly<Record<NodeId, Rect>>, places: Readonly<Record<NodeId, Place>> = {}): Layout {
  return { box: (node) => boxes[node] ?? null, place: (node) => places[node] ?? null };
}
