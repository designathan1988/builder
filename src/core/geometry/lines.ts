// Lines of laid-out boxes (ARCHITECTURE.md; specs drag-reorder-canvas and radius-border-gap-handles, Problems in Pager
// 5): how a container lays its children out, read from their boxes on the screen. Along x the lines are rows (boxes
// whose vertical extents overlap share one), along y columns (boxes whose horizontal extents overlap); each line holds
// its boxes in the order shown along it. The drop proposal finds the slot of a point with them
// (src/editor/drag/drop.ts), the canvas chrome the neighbours an insertion line stands between
// (src/editor/canvas/chrome.tsx) and the edit handles the columns and rows the gap bands lie between
// (src/editor/canvas/edit-handles.tsx).
import type { Box } from './snap.ts';

export type LineAxis = 'x' | 'y';

const crossStart = (axis: LineAxis, b: Box): number => (axis === 'x' ? b.y : b.x);
const crossEnd = (axis: LineAxis, b: Box): number => (axis === 'x' ? b.y + b.height : b.x + b.width);
const mainStart = (axis: LineAxis, b: Box): number => (axis === 'x' ? b.x : b.y);
// boxes that touch share no line: they must overlap by more than this, in pixels (the layout's fractions at a zoom
// that is not 100 % make touching boxes overlap by a hair)
const OVERLAP = 0.5;

// The lines of the items, in the order they come across the axis (rows top to bottom, columns left to right), each
// with its items in the order shown along it.
export function linesOf<T extends { readonly box: Box }>(items: readonly T[], axis: LineAxis): T[][] {
  const lines: { from: number; to: number; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => crossStart(axis, a.box) - crossStart(axis, b.box))) {
    const line = lines.find((l) => crossStart(axis, item.box) < l.to - OVERLAP && crossEnd(axis, item.box) > l.from + OVERLAP);
    if (line) {
      line.items.push(item);
      line.from = Math.min(line.from, crossStart(axis, item.box));
      line.to = Math.max(line.to, crossEnd(axis, item.box));
    } else lines.push({ from: crossStart(axis, item.box), to: crossEnd(axis, item.box), items: [item] });
  }
  return lines.map((l) => l.items.sort((a, b) => mainStart(axis, a.box) - mainStart(axis, b.box)));
}

// Where a line lies across the axis: from its first edge to its last.
export function lineExtent(line: readonly { readonly box: Box }[], axis: LineAxis): { readonly from: number; readonly to: number } {
  return { from: Math.min(...line.map((i) => crossStart(axis, i.box))), to: Math.max(...line.map((i) => crossEnd(axis, i.box))) };
}

// Whether two boxes lie on one line along the axis (their extents across it overlap).
export function sameLine(a: Box, b: Box, axis: LineAxis): boolean {
  return crossStart(axis, a) < crossEnd(axis, b) - OVERLAP && crossEnd(axis, a) > crossStart(axis, b) + OVERLAP;
}

// The gaps between consecutive lines across the axis, as [end of one line, start of the next], in order: between the
// rows (axis x) or between the columns (axis y).
export function gapsBetween(lines: readonly (readonly { readonly box: Box }[])[], axis: LineAxis): [number, number][] {
  const extents = lines
    .filter((l) => l.length > 0)
    .map((l) => lineExtent(l, axis))
    .sort((a, b) => a.from - b.from);
  return extents.slice(1).map((e, i) => [extents[i]?.to ?? e.from, e.from]);
}

// The gap bands of a container (spec radius-border-gap-handles, Problems in Pager 5): the column gap as a band between
// each two columns of its children, across the container's height, the row gap as a band between each two rows,
// across its width; never thinner than `min`.
export function gapBands(items: readonly { readonly box: Box }[], container: Box, gap: 'column' | 'row', min: number): Box[] {
  if (gap === 'column') return gapsBetween(linesOf(items, 'y'), 'y').map(([a, b]) => ({ x: a, y: container.y, width: Math.max(min, b - a), height: container.height }));
  return gapsBetween(linesOf(items, 'x'), 'x').map(([a, b]) => ({ x: container.x, y: a, width: container.width, height: Math.max(min, b - a) }));
}
