// The drag session (spec drag-level-keys-escape): the ladder of a proposal, the level keys and Escape, run through a
// gesture of the editor store as the keymap runs them during a drag.
import { afterEach, describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import type { NodeId } from '../../core/document/model.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { drawnProposal, isCancelled, ladder, liveDrag } from './drag-session.ts';
import type { DropProposal } from './drop.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
const aurora = () => {
  const s = createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
  s.dispatch('project.open', { file: JSON.stringify(fixture) });
  return s;
};
const id = (s: string) => s as NodeId;
const after = (parent: string, index: number, reference: string): DropProposal => ({ parent: id(parent), index, placement: 'after', reference: id(reference), refused: false });

afterEach(() => liveDrag.end());

describe('the drag session (src/editor/drag/drag-session.ts)', () => {
  it('climbs one receiver at a time up to the page root', () => {
    const doc = aurora().getState().document;
    // Title dragged, over the lower half of Intro: after Intro in Hero, then after Hero in the Page, then the top
    expect(ladder(doc, [id('n-title')], after('n-hero', 1, 'n-intro'))).toEqual([after('n-hero', 1, 'n-intro'), after('n-page', 1, 'n-hero')]);
    // before a sibling climbs before the receiver; inside a container climbs after it
    const before: DropProposal = { parent: id('n-grid'), index: 0, placement: 'before', reference: id('n-card-a'), refused: false };
    expect(ladder(doc, [id('n-note')], before).map((p) => [p.placement, p.reference, p.index])).toEqual([
      ['before', 'n-card-a', 0],
      ['before', 'n-grid', 0],
      ['before', 'n-plans', 1],
    ]);
    const inside: DropProposal = { parent: id('n-card-c'), index: 0, placement: 'inside', reference: id('n-card-c'), refused: false };
    expect(ladder(doc, [id('n-note')], inside)[1]).toEqual({ parent: id('n-grid'), index: 3, placement: 'after', reference: id('n-card-c'), refused: false });
    // a refused proposal has no level above it
    expect(ladder(doc, [id('n-hero')], { ...inside, refused: true })).toHaveLength(1);
  });

  it('ArrowUp and ArrowDown change the level of the live drag, refuse above the top and change no document', () => {
    const s = aurora();
    const g = s.gesture();
    const drag = liveDrag.begin();
    liveDrag.propose([id('n-title')], after('n-hero', 1, 'n-intro'));
    const document = s.getState().document;
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drop.after', params: { name: 'Hero' } });
    const live = liveDrag.get();
    if (live === null) throw new Error('no live drag');
    expect(drawnProposal(s.getState().ui.drag, live, document)).toEqual({ proposal: after('n-page', 1, 'n-hero'), level: 1 });
    // the top: refused, the level stays
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'refused', message: { key: 'status.drop.topLevel', params: {} } });
    expect(drawnProposal(s.getState().ui.drag, live, document).level).toBe(1);
    expect(g.dispatch('drag.levelDown', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drop.after', params: { name: 'Intro' } });
    expect(drawnProposal(s.getState().ui.drag, live, document)).toEqual({ proposal: after('n-hero', 1, 'n-intro'), level: 0 });
    // below level 0 nothing happens
    expect(g.dispatch('drag.levelDown', {})).toEqual({ status: 'done', changed: false });
    // a new drag starts at level 0
    g.dispatch('drag.levelUp', {});
    const next = liveDrag.begin();
    liveDrag.propose([id('n-title')], after('n-hero', 1, 'n-intro'));
    const nextLive = liveDrag.get();
    if (nextLive === null) throw new Error('no live drag');
    expect(drawnProposal(s.getState().ui.drag, nextLive, document).level).toBe(0);
    expect(next).not.toBe(drag);
    g.commit();
    expect(s.getState().document).toBe(document);
    expect(s.getState().history.past).toHaveLength(0);
  });

  it('Escape cancels the live drag once, with its message, and adds no undo step', () => {
    const s = aurora();
    const g = s.gesture();
    const drag = liveDrag.begin();
    expect(g.dispatch('drag.cancel', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drag.cancelled', params: {} });
    expect(isCancelled(s.getState().ui.drag, drag)).toBe(true);
    expect(g.dispatch('drag.cancel', {})).toEqual({ status: 'done', changed: false });
    g.commit();
    expect(s.getState().history.past).toHaveLength(0);
    // with no drag at all the keys do nothing
    liveDrag.end();
    const h = s.gesture();
    expect(h.dispatch('drag.levelUp', {})).toEqual({ status: 'done', changed: false });
    expect(h.dispatch('drag.cancel', {})).toEqual({ status: 'done', changed: false });
    h.commit();
  });
});
