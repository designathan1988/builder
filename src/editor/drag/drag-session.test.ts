// The drag session (spec drag-level-keys-escape): the ladder of a proposal, the level keys and Escape, run through a
// gesture of the store as the keymap runs them during a drag.
import { afterEach, describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { COMMANDS, PREDICATES } from '../../app/commands.ts';
import type { DocumentJson, NodeId } from '../../core/document/model.ts';
import { rulesFromManifest } from '../../core/document/validate.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { createStore } from '../../core/store/store.ts';
import type { CommandId, ConstantId, MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import { INITIAL_PREFERENCES } from '../preferences/preferences.ts';
import { initialEditorUi, type EditorUi } from '../state.ts';
import { drawnProposal, ladder, liveDrag } from './drag-session.ts';
import type { DropProposal } from './drop.ts';

const AURORA = fixture as DocumentJson;
const aurora = () =>
  createStore<EditorUi>({
    table: COMMANDS,
    predicates: PREDICATES,
    commands: new Map(manifest.commands.map((c) => [c.id as CommandId, c])),
    constants: new Map(manifest.interactions.constants.map((c) => [c.id as ConstantId, c.value])),
    rules: rulesFromManifest(manifest.elements, manifest.properties, manifest.html),
    clock: manualClock(0),
    ids: sequentialIds('t'),
    words: (ui, key: MessageId) => translate(ui.preferences.locale, key),
    initial: { document: AURORA, ui: initialEditorUi(INITIAL_PREFERENCES) },
    freeze: true,
  });
const id = (s: string) => s as NodeId;
const after = (parent: string, index: number, reference: string): DropProposal => ({ parent: id(parent), index, placement: 'after', reference: id(reference), refused: false });
const drawn = (s: ReturnType<typeof aurora>) => {
  const live = liveDrag.get();
  if (live === null) throw new Error('no live drag');
  return drawnProposal(s.getState().ui.drag, live, s.getState().document);
};

afterEach(() => liveDrag.end());

describe('the drag session (src/editor/drag/drag-session.ts)', () => {
  it('climbs one receiver at a time up to the page root', () => {
    // Title dragged over the lower half of Intro: after Intro in Hero, then after Hero in the Page, the top
    expect(ladder(AURORA, [id('n-title')], after('n-hero', 1, 'n-intro'))).toEqual([after('n-hero', 1, 'n-intro'), after('n-page', 1, 'n-hero')]);
    // before a sibling climbs before the receiver; inside a container climbs after it
    const before: DropProposal = { parent: id('n-grid'), index: 0, placement: 'before', reference: id('n-card-a'), refused: false };
    expect(ladder(AURORA, [id('n-note')], before).map((p) => [p.placement, p.reference, p.parent, p.index])).toEqual([
      ['before', 'n-card-a', 'n-grid', 0],
      ['before', 'n-grid', 'n-plans', 0],
      ['before', 'n-plans', 'n-page', 1],
    ]);
    const inside: DropProposal = { parent: id('n-card-c'), index: 0, placement: 'inside', reference: id('n-card-c'), refused: false };
    expect(ladder(AURORA, [id('n-note')], inside)[1]).toEqual({ parent: id('n-grid'), index: 3, placement: 'after', reference: id('n-card-c'), refused: false });
    // the index counts the receiver's siblings without the dragged nodes: Hero dragged, after Plans in the Page
    expect(ladder(AURORA, [id('n-hero')], after('n-page', 1, 'n-plans'))).toHaveLength(1);
    expect(ladder(AURORA, [id('n-hero')], after('n-grid', 3, 'n-card-c'))[1]).toEqual(after('n-plans', 1, 'n-grid'));
    // a refused proposal, and none at all, have no level above them
    expect(ladder(AURORA, [id('n-hero')], { ...inside, refused: true })).toHaveLength(1);
    expect(ladder(AURORA, [id('n-hero')], null)).toEqual([]);
  });

  it('ArrowUp and ArrowDown change the level of the live drag, refuse above the top and change no document', () => {
    const s = aurora();
    const g = s.gesture();
    liveDrag.begin([id('n-title')]);
    liveDrag.propose(after('n-hero', 1, 'n-intro'));
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drop.after', params: { name: 'Hero' } });
    expect(drawn(s)).toEqual({ proposal: after('n-page', 1, 'n-hero'), level: 1 });
    // the top: refused, the level stays
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'refused', message: { key: 'status.drop.topLevel', params: {} } });
    expect(drawn(s).level).toBe(1);
    expect(g.dispatch('drag.levelDown', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drop.after', params: { name: 'Intro' } });
    expect(drawn(s)).toEqual({ proposal: after('n-hero', 1, 'n-intro'), level: 0 });
    // below the pointer's own level nothing happens
    expect(g.dispatch('drag.levelDown', {})).toEqual({ status: 'done', changed: false });
    g.commit();
    expect(s.getState().document).toBe(AURORA);
    expect(s.getState().history.past).toHaveLength(0);
  });

  it('shows a level never above the ladder of the proposal the pointer makes now, and starts a new drag at level 0', () => {
    const s = aurora();
    const g = s.gesture();
    liveDrag.begin([id('n-note')]);
    liveDrag.propose({ parent: id('n-grid'), index: 0, placement: 'before', reference: id('n-card-a'), refused: false });
    g.dispatch('drag.levelUp', {});
    g.dispatch('drag.levelUp', {});
    expect(drawn(s).level).toBe(2);
    // the pointer moves to a proposal one level from the top: the level shown is that top, and one ArrowDown goes
    // one level down from it
    liveDrag.propose(after('n-hero', 1, 'n-intro'));
    expect(drawn(s)).toEqual({ proposal: after('n-page', 1, 'n-hero'), level: 1 });
    g.dispatch('drag.levelDown', {});
    expect(drawn(s)).toEqual({ proposal: after('n-hero', 1, 'n-intro'), level: 0 });
    g.dispatch('drag.levelUp', {});
    liveDrag.end();
    liveDrag.begin([id('n-title')]);
    liveDrag.propose(after('n-hero', 1, 'n-intro'));
    expect(drawn(s).level).toBe(0);
    g.commit();
  });

  it('with no live drag, or no proposal (off the page), the level keys do nothing', () => {
    const s = aurora();
    const g = s.gesture();
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'done', changed: false });
    liveDrag.begin([]);
    expect(g.dispatch('drag.levelUp', {})).toEqual({ status: 'done', changed: false });
    expect(g.dispatch('drag.levelDown', {})).toEqual({ status: 'done', changed: false });
    g.commit();
  });

  it('Escape records one more cancellation, with its message, and adds no undo step', () => {
    const s = aurora();
    const g = s.gesture();
    expect(g.dispatch('drag.cancel', {})).toEqual({ status: 'done', changed: true });
    expect(s.getState().message).toEqual({ key: 'status.drag.cancelled', params: {} });
    expect(s.getState().ui.drag.cancels).toBe(1);
    g.commit();
    expect(s.getState().history.past).toHaveLength(0);
  });
});
