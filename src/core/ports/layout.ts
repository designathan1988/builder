// The layout port: where the canvas draws each node of the page it shows. The core never measures a page (it has no
// DOM); a handler that acts on what a gesture covers on the page (the marquee band) asks this port, and the editor
// gives the measurement of its canvas (src/editor/canvas/coordinates.ts, pageLayout). Tests pass boxes they choose.
import type { NodeId, Rect } from '../../generated/commands.ts';

export interface Layout {
  // the node's box in page pixels (from the top-left of the page, scroll included), or null when the canvas does not
  // draw it
  box(node: NodeId): Rect | null;
}

// A layout that draws nothing: the store's default when no canvas measures the page.
export const noLayout: Layout = {
  box: () => null,
};

// A layout of fixed boxes, for tests.
export function fixedLayout(boxes: Readonly<Record<NodeId, Rect>>): Layout {
  return { box: (node) => boxes[node] ?? null };
}
