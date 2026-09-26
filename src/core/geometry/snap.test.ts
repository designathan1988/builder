// The snapping rule (src/core/geometry/snap.ts; spec snap-while-moving, Problems in Pager 1): within the distance the
// earliest tier of the priority table wins however near a later tier is; inside a tier the nearest line wins; beyond
// the distance nothing snaps; the ruler ticks near an edge are the multiples of the step within the distance.
import { describe, expect, it } from 'vitest';
import { rulerLines, snapAxis, type SnapLine } from './snap.ts';

const line = (at: number, source: SnapLine['source']): SnapLine => ({ axis: 'x', at, source, target: null, span: null });

describe('snapAxis', () => {
  it('lets a guide 4 px away win over a ruler tick 1 px away', () => {
    const snap = snapAxis([399], [line(400, 'ruler'), line(403, 'guide')], 6);
    expect(snap?.line.source).toBe('guide');
    expect(snap?.offset).toBe(4);
  });
  it('takes the nearest line of the same tier, from any of the moving edges', () => {
    const snap = snapAxis([100, 150, 200], [line(96, 'element'), line(202, 'parent')], 6);
    expect(snap?.line.at).toBe(202);
    expect(snap?.offset).toBe(2);
  });
  it('takes a later tier when no earlier one is within the distance', () => {
    const snap = snapAxis([399], [line(390, 'guide'), line(400, 'grid')], 6);
    expect(snap?.line.source).toBe('grid');
  });
  it('snaps to nothing beyond the distance', () => {
    expect(snapAxis([399], [line(406, 'guide'), line(392, 'element')], 6)).toBeNull();
  });
});

describe('rulerLines', () => {
  it('gives the ticks within the distance of each edge', () => {
    expect(rulerLines('x', [999], 25, 6).map((l) => l.at)).toEqual([1000]);
    expect(rulerLines('x', [1003], 10, 6).map((l) => l.at)).toEqual([1000]);
    expect(rulerLines('x', [1005], 10, 6).map((l) => l.at).sort()).toEqual([1000, 1010]);
  });
});
