import { describe, expect, it } from 'vitest';
import { gapBands, gapsBetween, linesOf, sameLine } from './lines.ts';

const at = (id: string, x: number, y: number, width = 100, height = 50) => ({ id, box: { x, y, width, height } });
// a grid of 3 columns of 100 px with 20 px gaps, two rows of 50 px with a 10 px gap: cards 1-3, then 4
const GRID = [at('c1', 0, 0), at('c2', 120, 0), at('c3', 240, 0), at('c4', 0, 60)];

describe('linesOf', () => {
  it('parts a grid into its rows along x, each in the order shown', () => {
    expect(linesOf(GRID, 'x').map((l) => l.map((i) => i.id))).toEqual([['c1', 'c2', 'c3'], ['c4']]);
  });
  it('parts a grid into its columns along y', () => {
    expect(linesOf(GRID, 'y').map((l) => l.map((i) => i.id))).toEqual([['c1', 'c4'], ['c2'], ['c3']]);
  });
  it('orders a reversed row as shown, not as given', () => {
    expect(linesOf([at('a', 240, 0), at('b', 120, 0), at('c', 0, 0)], 'x').map((l) => l.map((i) => i.id))).toEqual([['c', 'b', 'a']]);
  });
  it('keeps a block column one item per row', () => {
    expect(linesOf([at('a', 0, 0, 300), at('b', 0, 60, 300)], 'x').map((l) => l.map((i) => i.id))).toEqual([['a'], ['b']]);
  });
});

describe('gapsBetween', () => {
  it('gives the two column gaps and the one row gap of a grid of 3 columns', () => {
    expect(gapsBetween(linesOf(GRID, 'y'), 'y')).toEqual([
      [100, 120],
      [220, 240],
    ]);
    expect(gapsBetween(linesOf(GRID, 'x'), 'x')).toEqual([[50, 60]]);
  });
  it('gives no gap for one line', () => {
    expect(gapsBetween(linesOf([at('a', 0, 0), at('b', 120, 0)], 'x'), 'x')).toEqual([]);
  });
});

describe('sameLine', () => {
  it('says whether two boxes share a row', () => {
    const [c1, , c3, c4] = GRID.map((i) => i.box);
    if (!c1 || !c3 || !c4) throw new Error('the grid has four cards');
    expect(sameLine(c1, c3, 'x')).toBe(true);
    expect(sameLine(c1, c4, 'x')).toBe(false);
  });
});

describe('gapBands', () => {
  const container = { x: 0, y: 0, width: 340, height: 110 };
  it('draws two vertical column-gap bands and one horizontal row-gap band in a grid of 3 columns', () => {
    expect(gapBands(GRID, container, 'column', 6)).toEqual([
      { x: 100, y: 0, width: 20, height: 110 },
      { x: 220, y: 0, width: 20, height: 110 },
    ]);
    expect(gapBands(GRID, container, 'row', 6)).toEqual([{ x: 0, y: 50, width: 340, height: 10 }]);
  });
  it('draws no row-gap band in a single row and keeps a band at least as thick as its minimum', () => {
    const row = [at('a', 0, 0), at('b', 102, 0)];
    expect(gapBands(row, container, 'row', 6)).toEqual([]);
    expect(gapBands(row, container, 'column', 6)).toEqual([{ x: 100, y: 0, width: 6, height: 110 }]);
  });
});

describe('touching boxes', () => {
  it('keep their own lines when a zoom makes them overlap by a hair', () => {
    const column = [at('a', 0, 0, 300, 50.0004), at('b', 0, 50, 300, 50)];
    expect(linesOf(column, 'x').map((l) => l.map((i) => i.id))).toEqual([['a'], ['b']]);
    expect(gapBands(column, { x: 0, y: 0, width: 300, height: 100 }, 'row', 6)).toHaveLength(1);
  });
});
