// The drop proposal (spec drag-reorder-canvas, "Hit zones and thresholds") on measured boxes given by hand.
import { describe, expect, it } from 'vitest';
import type { DocNode, DocumentJson, NodeId } from '../../core/document/model.ts';
import { DROP_ZONES, edgeBand, escapeBand, proposeDrop, slotAt, type Axis, type Box, type DropSpace } from './drop.ts';

const node = (id: string, type: string, children: DocNode[] = []): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag: null, attributes: {}, classes: [], styles: {}, text: null, children });
const DOC: DocumentJson = {
  version: 1,
  pages: [
    {
      id: 'p',
      name: 'Home',
      file: 'index.html',
      tree: node('Page', 'page', [
        node('Hero', 'section', [node('Title', 'heading'), node('Intro', 'paragraph'), node('Actions', 'div')]),
        node('Grid', 'div', [node('CardA', 'article', [node('CardATitle', 'heading')]), node('CardB', 'article')]),
        node('Row', 'div', [node('Left', 'paragraph'), node('Right', 'paragraph')]),
      ]),
    },
  ],
};
const CONTAINERS = new Set(['page', 'section', 'div', 'article']);
const isContainer = (type: string) => CONTAINERS.has(type);

// screen boxes at zoom 0.5: Hero padded; the Grid's first card and its title share their top edge with the Grid
const BOXES: Record<string, Box> = {
  Hero: { x: 0, y: 0, width: 400, height: 150 },
  Title: { x: 20, y: 40, width: 360, height: 20 },
  Intro: { x: 20, y: 70, width: 360, height: 10 },
  Actions: { x: 20, y: 90, width: 360, height: 20 },
  Grid: { x: 0, y: 200, width: 400, height: 60 },
  CardA: { x: 0, y: 200, width: 400, height: 11 },
  CardATitle: { x: 0, y: 200, width: 400, height: 11 },
  CardB: { x: 0, y: 220, width: 400, height: 20 },
  Row: { x: 0, y: 300, width: 400, height: 20 },
  Left: { x: 0, y: 300, width: 100, height: 20 },
  Right: { x: 100, y: 300, width: 100, height: 20 },
};
const space = (axes: Record<string, Axis> = { Row: 'x' }): DropSpace => ({ zoom: 0.5, box: (id) => BOXES[id] ?? null, axis: (id) => axes[id] ?? 'y' });
const propose = (dragged: string[], under: string[], x: number, y: number) => proposeDrop(DOC, isContainer, dragged as NodeId[], under, { x, y }, space());

describe('the drop proposal (src/editor/drag/drop.ts)', () => {
  it('a leaf splits in halves along its parent\'s flow; the index counts the siblings without the dragged node', () => {
    expect(propose(['Intro'], ['Title', 'Hero', 'Page'], 50, 49)).toEqual({ parent: 'Hero', index: 0, placement: 'before', reference: 'Title', refused: false });
    expect(propose(['Intro'], ['Title', 'Hero', 'Page'], 50, 51)).toEqual({ parent: 'Hero', index: 1, placement: 'after', reference: 'Title', refused: false });
    expect(propose(['Title'], ['Actions', 'Hero', 'Page'], 50, 108)).toEqual({ parent: 'Hero', index: 2, placement: 'after', reference: 'Actions', refused: false });
  });

  it('a row flex splits along x', () => {
    expect(propose(['Title'], ['Right', 'Row', 'Page'], 140, 310)).toMatchObject({ parent: 'Row', index: 1, placement: 'before', reference: 'Right' });
    expect(propose(['Title'], ['Right', 'Row', 'Page'], 160, 310)).toMatchObject({ parent: 'Row', index: 2, placement: 'after', reference: 'Right' });
  });

  it('over the dragged node or its descendants: refused, on the deepest of them under the pointer', () => {
    expect(propose(['Intro'], ['Intro', 'Hero', 'Page'], 50, 75)).toEqual({ parent: 'Intro', index: 0, placement: 'inside', reference: 'Intro', refused: true });
    expect(propose(['Hero'], ['Title', 'Hero', 'Page'], 50, 50)).toEqual({ parent: 'Title', index: 0, placement: 'inside', reference: 'Title', refused: true });
  });

  it('a container is before or after in its edge bands and inside between them, at the slot of the pointer', () => {
    // the empty Actions: min(8, 0.25 × 40) CSS px = 4 screen px at each end, inside between
    expect(edgeBand(20, true, 0.5, DROP_ZONES)).toBe(4);
    expect(propose(['Title'], ['Actions', 'Hero', 'Page'], 50, 93)).toMatchObject({ placement: 'before', reference: 'Actions' });
    expect(propose(['Title'], ['Actions', 'Hero', 'Page'], 50, 100)).toEqual({ parent: 'Actions', index: 0, placement: 'inside', reference: 'Actions', refused: false });
    // Hero's padding, past its band: the slot counts the children whose centre is before the pointer, without the
    // dragged ones
    expect(propose(['Actions'], ['Hero', 'Page'], 50, 20)).toMatchObject({ parent: 'Hero', index: 0, placement: 'inside' });
    expect(propose(['Title'], ['Hero', 'Page'], 50, 85)).toMatchObject({ parent: 'Hero', index: 1, placement: 'inside' });
    // the page root's own background: inside it, after the children above the pointer
    expect(propose(['Title'], ['Page'], 50, 500)).toEqual({ parent: 'Page', index: 3, placement: 'inside', reference: 'Page', refused: false });
  });

  it('near the edge an ancestor shares with a leaf, the innermost ancestor is the level; never narrower than the floor', () => {
    // CardA is 22 CSS px tall: min(12, 5.5 − 8) is below zero, the floor keeps 6, plus the slop
    expect(escapeBand(11, 0.5, DROP_ZONES)).toBe(8);
    expect(propose(['CardB'], ['CardATitle', 'CardA', 'Grid', 'Page'], 50, 202)).toEqual({ parent: 'Grid', index: 0, placement: 'before', reference: 'CardA', refused: false });
    // a card below the floor's length keeps only the slop; near the card's lower edge, after it
    expect(escapeBand(11, 2, DROP_ZONES)).toBe(2);
    expect(propose(['CardB'], ['CardATitle', 'CardA', 'Grid', 'Page'], 50, 209)).toEqual({ parent: 'Grid', index: 1, placement: 'after', reference: 'CardA', refused: false });
  });
});

// the slot in two dimensions (spec drag-reorder-canvas, Problems in Pager 5): a grid of 3 columns of 100 px with 20 px
// gaps, cards 0-2 on the first row and 3 on the second
describe('slotAt', () => {
  const laid = [0, 1, 2, 3].map((order) => ({ id: `c${order}` as NodeId, order, box: { x: (order % 3) * 120, y: order < 3 ? 0 : 60, width: 100, height: 50 } }));
  it('is between two cards of a row for a point in the gap between them', () => {
    expect(slotAt(laid, { x: 110, y: 25 }, 'x', false)).toBe(1);
  });
  it('is after the last card of a row for a point in the empty cell after it, on the second row', () => {
    expect(slotAt(laid, { x: 200, y: 85 }, 'x', false)).toBe(4);
  });
  it('takes the nearest row for a point in the row gap, never the first card', () => {
    expect(slotAt(laid, { x: 250, y: 53 }, 'x', false)).toBe(2);
    expect(slotAt(laid, { x: 250, y: 57 }, 'x', false)).toBe(4);
  });
  it('turns before as shown into after in the document in a reversed row', () => {
    const reversed = [0, 1, 2].map((order) => ({ id: `r${order}` as NodeId, order, box: { x: 240 - order * 120, y: 0, width: 100, height: 50 } }));
    expect(slotAt(reversed, { x: 350, y: 25 }, 'x', true)).toBe(0);
    expect(slotAt(reversed, { x: 230, y: 25 }, 'x', true)).toBe(1);
    expect(slotAt(reversed, { x: 10, y: 25 }, 'x', true)).toBe(3);
  });
});
