import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMANDS, PREDICATES } from '../../app/commands.ts';
import type { CommandId, ConstantId, MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import { NOT_AVAILABLE_YET, isBuilt, message, registerHandler, registerPredicate, type CommandTable, type PredicateTable } from '../commands/registry.ts';
import { createEmptyDocument, locate, type DocNode, type DocumentJson, type Selection } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import { deepEqual } from '../history/transaction.ts';
import { manualClock, type ManualClock } from '../ports/clock.ts';
import { sequentialIds, type IdGenerator } from '../ports/ids.ts';
import { InvalidStateError, createStore, type Store } from './store.ts';
import { INITIAL_PREFERENCES } from '../../editor/preferences/preferences.ts';
import { initialEditorUi, type EditorUi } from '../../editor/state.ts';

// The store under test: the real command table with small test handlers in place of a few commands, each one kind of
// history declaration of the manifest (undoable, coalescing, per-gesture, not undoable), so these tests exercise the
// store's own rules apart from what the real handlers do (their own tests: src/core/structure/*.test.ts, on frozen
// documents; the real handlers under the store's frozen states: src/editor/canvas/text-edit.test.ts).
// element.insert (per gesture): a Container under the parent (the first page's root by default), selected
const insert = registerHandler('element.insert', ({ state, ids }, args) => {
  const parentId = args.parent ?? state.document.pages[0]?.tree.id ?? '';
  const parent = locate(state.document, parentId);
  if (!parent) return { kind: 'refused', message: message('status.refused.intoItself') };
  const index = Math.min(args.index ?? parent.node.children.length, parent.node.children.length);
  const node: DocNode = { id: ids.next(), type: 'div', name: `Container ${args.entry}`, tag: 'div', attributes: {}, classes: [], styles: {}, text: null, children: [] };
  return { kind: 'change', patches: [{ op: 'add', path: [...parent.path, 'children', index], value: node }], selection: [node.id] };
});

// element.rename (per dispatch)
const rename = registerHandler('element.rename', ({ state }, args) => {
  const at = locate(state.document, args.target);
  if (!at) return { kind: 'refused', message: message('status.refused.intoItself') };
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'name'], value: args.name }] };
});

// element.delete (per dispatch): the primary selected node, never a page root; its parent is selected after
const remove = registerHandler('element.delete', ({ state }) => {
  const at = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  if (!at?.parent) return { kind: 'refused', message: message('status.delete.root') };
  return { kind: 'change', patches: [{ op: 'remove', path: at.path }], selection: [at.parent.id] };
});

// selection.select (not undoable)
const select = registerHandler('selection.select', ({ state }, args) => {
  if (!locate(state.document, args.target)) return { kind: 'refused', message: message('status.refused.intoItself') };
  return { kind: 'change', selection: [args.target] };
});

// position.move (coalesces within history.nudgeBurstWindow): writes the selection's left
const move = registerHandler('position.move', ({ state }, args) => {
  const at = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  if (!at) return { kind: 'refused', message: message('status.position.notPositioned') };
  const current = parseFloat(String(at.node.styles.desktop?.base?.left ?? '0'));
  const base = at.node.styles.desktop?.base ?? {};
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'styles'], value: { ...at.node.styles, desktop: { ...at.node.styles.desktop, base: { ...base, left: `${current + args.dx}px` } } } }] };
});

// geometry.resize (per gesture): writes the selection's width
const resize = registerHandler('geometry.resize', ({ state }, args) => {
  const at = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  if (!at || args.width === undefined) return { kind: 'refused', message: message('status.refused.intoItself') };
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'styles'], value: { ...at.node.styles, desktop: { ...at.node.styles.desktop, base: { ...at.node.styles.desktop?.base, width: args.width } } } }] };
});

const TEST_COMMANDS = {
  ...COMMANDS,
  'element.insert': insert,
  'element.rename': rename,
  'element.delete': remove,
  'selection.select': select,
  'position.move': move,
  'geometry.resize': resize,
} satisfies CommandTable<EditorUi>;

const TEST_PREDICATES = {
  ...PREDICATES,
  hasSelection: registerPredicate('hasSelection', (state) => state.selection.length > 0),
  positionedSelection: registerPredicate('positionedSelection', (state) => state.selection.length > 0),
} satisfies PredicateTable<EditorUi>;

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const MANIFEST_COMMANDS = new Map(manifest.commands.map((c) => [c.id as CommandId, c]));
const CONSTANTS = new Map(manifest.interactions.constants.map((c) => [c.id as ConstantId, c.value]));
const WORDS = (ui: EditorUi, key: MessageId) => translate(ui.preferences.locale, key);

interface TestStore {
  readonly store: Store<EditorUi>;
  readonly clock: ManualClock;
  readonly ids: IdGenerator;
  readonly root: string;
}

function emptyDocument(ids: IdGenerator): DocumentJson {
  return createEmptyDocument(ids, { page: 'Home', root: 'Page' }, RULES.root);
}

function testStore(table: CommandTable<EditorUi> = TEST_COMMANDS, predicates: PredicateTable<EditorUi> = TEST_PREDICATES): TestStore {
  const clock = manualClock(1_000_000);
  const ids = sequentialIds('n');
  const document = emptyDocument(ids);
  const store = createStore<EditorUi>({
    table,
    predicates,
    commands: MANIFEST_COMMANDS,
    constants: CONSTANTS,
    rules: RULES,
    clock,
    ids,
    words: WORDS,
    initial: { document, ui: initialEditorUi(INITIAL_PREFERENCES) },
    freeze: true,
  });
  return { store, clock, ids, root: document.pages[0]?.tree.id ?? '' };
}

const insertInto = (s: TestStore, parent?: string) => s.store.dispatch('element.insert', parent === undefined ? { entry: 'container' } : { entry: 'container', parent });
const nameOf = (doc: DocumentJson, id: string) => locate(doc, id)?.node.name;

describe('the store', () => {
  it('starts from a valid, frozen state with an empty history', () => {
    const { store } = testStore();
    const state = store.getState();
    expect(state.history).toEqual({ past: [], future: [] });
    expect(state.selection).toEqual([]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.document.pages[0]?.tree)).toBe(true);
  });

  it('says whether a command would run now without changing anything', () => {
    const s = testStore();
    // not built (timeline.stop: NOT_AVAILABLE_YET), its predicate fails (nothing selected), its handler refuses (the
    // page root cannot be deleted)
    expect(s.store.canRun('timeline.stop', {})).toBe(false);
    expect(s.store.canRun('element.duplicate', {})).toBe(false);
    expect(s.store.canRun('element.delete', {})).toBe(false);
    s.store.dispatch('selection.select', { target: s.root });
    expect(s.store.canRun('element.delete', {})).toBe(false);
    insertInto(s);
    const before = s.store.getState();
    expect(s.store.canRun('element.delete', {})).toBe(true);
    expect(s.store.getState()).toBe(before);
  });

  it('says why a command would not run now without changing anything', () => {
    const s = testStore();
    // not built; its predicate fails (nothing selected: the manifest's refusal key); its handler refuses (the page
    // root cannot be deleted); it would run
    expect(s.store.refusal('timeline.stop', {})).toEqual(message('common.notAvailableYet'));
    expect(s.store.refusal('element.delete', {})).toEqual(message('refusal.nothingSelected'));
    s.store.dispatch('selection.select', { target: s.root });
    const selected = s.store.getState();
    expect(s.store.refusal('element.delete', {})).toEqual(message('status.delete.root'));
    expect(s.store.getState()).toBe(selected);
    insertInto(s);
    const before = s.store.getState();
    expect(s.store.refusal('element.delete', {})).toBeNull();
    expect(s.store.getState()).toBe(before);
  });

  it('changes nothing for a command whose entry is NOT_AVAILABLE_YET', () => {
    const { store } = testStore();
    const before = store.getState();
    expect(store.dispatch('timeline.stop', {})).toEqual({ status: 'not-available-yet' });
    expect(store.getState()).toBe(before);
  });

  it('refuses a command whose availability predicate fails, says why, and records nothing', () => {
    const { store } = testStore();
    const before = store.getState();
    const result = store.dispatch('element.delete', {});
    expect(result).toEqual({ status: 'refused', message: { key: 'refusal.nothingSelected', params: {} } });
    expect(store.getState().document).toBe(before.document);
    expect(store.getState().history).toBe(before.history);
    expect(store.getState().message).toEqual({ key: 'refusal.nothingSelected', params: {} });
  });

  it("says a predicate's own refusal when it is one the manifest declares for the command, and refuses any other", () => {
    const own = registerPredicate<EditorUi>('hasSelection', () => false, () => message('status.delete.root', { name: 'Page' }));
    const { store } = testStore(TEST_COMMANDS, { ...TEST_PREDICATES, hasSelection: own });
    expect(store.dispatch('element.delete', {})).toEqual({ status: 'refused', message: { key: 'status.delete.root', params: { name: 'Page' } } });
    expect(store.getState().message).toEqual({ key: 'status.delete.root', params: { name: 'Page' } });
    const undeclared = registerPredicate<EditorUi>('hasSelection', () => false, () => message('status.undo.nothing'));
    const other = testStore(TEST_COMMANDS, { ...TEST_PREDICATES, hasSelection: undeclared });
    expect(() => other.store.dispatch('element.delete', {})).toThrow(/does not declare/);
  });

  it('records a transaction with its patches, inverses and the selection before and after', () => {
    const s = testStore();
    insertInto(s);
    const [tx] = s.store.getState().history.past;
    expect(tx?.command).toBe('element.insert');
    expect(tx?.selectionBefore).toEqual([]);
    expect(tx?.selectionAfter).toEqual(['n3']);
    expect(tx?.patches).toHaveLength(1);
    expect(tx?.inverses).toEqual([{ op: 'remove', path: ['pages', 0, 'tree', 'children', 0] }]);
    expect(tx?.at).toBe(1_000_000);
  });

  it('undoes to the document and the selection before the command, and redoes to the ones after it', () => {
    const s = testStore();
    const initial = s.store.getState().document;
    insertInto(s);
    const afterInsert = s.store.getState();
    // the user selects the root afterwards: undo restores the selection of the insert's "before", not this one
    s.store.dispatch('selection.select', { target: s.root });
    s.store.dispatch('history.undo', {});
    expect(s.store.getState().document).toEqual(initial);
    expect(s.store.getState().selection).toEqual([]);
    expect(s.store.getState().message).toEqual({ key: 'status.undone', params: {} });
    s.store.dispatch('history.redo', {});
    expect(s.store.getState().document).toEqual(afterInsert.document);
    expect(s.store.getState().selection).toEqual(afterInsert.selection);
    expect(s.store.getState().message).toEqual({ key: 'status.redone', params: {} });
  });

  it('refuses undo and redo when there is nothing to undo or redo', () => {
    const s = testStore();
    expect(s.store.dispatch('history.undo', {})).toEqual({ status: 'refused', message: { key: 'status.undo.nothing', params: {} } });
    expect(s.store.dispatch('history.redo', {})).toEqual({ status: 'refused', message: { key: 'status.redo.nothing', params: {} } });
  });

  it('records no entry for a command that changes nothing', () => {
    const s = testStore();
    insertInto(s);
    const id = s.store.getState().selection[0] ?? '';
    const before = s.store.getState();
    const result = s.store.dispatch('element.rename', { target: id, name: nameOf(before.document, id) ?? '' });
    expect(result).toEqual({ status: 'done', changed: false });
    expect(s.store.getState()).toBe(before);
    expect(s.store.getState().history.past).toHaveLength(1);
  });

  it('empties the redo stack when a new command runs after an undo', () => {
    const s = testStore();
    insertInto(s);
    insertInto(s);
    s.store.dispatch('history.undo', {});
    expect(s.store.getState().history.future).toHaveLength(1);
    insertInto(s);
    expect(s.store.getState().history.future).toHaveLength(0);
    expect(s.store.dispatch('history.redo', {}).status).toBe('refused');
  });

  it('changes the selection through a command that is not undoable, without a history entry', () => {
    const s = testStore();
    s.store.dispatch('selection.select', { target: s.root });
    expect(s.store.getState().selection).toEqual([s.root]);
    expect(s.store.getState().history.past).toHaveLength(0);
  });

  it('never commits an invalid state: the whole tree is validated on every commit', () => {
    const s = testStore();
    insertInto(s);
    const before = s.store.getState();
    const id = before.selection[0] ?? '';
    expect(() => s.store.dispatch('element.rename', { target: id, name: '' })).toThrow(InvalidStateError);
    expect(s.store.getState()).toBe(before);
  });

  it('throws when a command the manifest declares not undoable changes the document', () => {
    const rogue = registerHandler('selection.select', ({ state }) => ({ kind: 'change', patches: [{ op: 'replace', path: ['pages', 0, 'name'], value: `${state.document.pages[0]?.name ?? ''}!` }] }));
    const s = testStore({ ...TEST_COMMANDS, 'selection.select': rogue });
    const before = s.store.getState();
    expect(() => s.store.dispatch('selection.select', { target: s.root })).toThrow(/not undoable/);
    expect(s.store.getState()).toBe(before);
  });

  it('deep-freezes every committed state, so nothing can change it in place', () => {
    const s = testStore();
    insertInto(s);
    const state = s.store.getState();
    const node = state.document.pages[0]?.tree.children[0];
    expect(() => {
      (node as unknown as { name: string }).name = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      (state.selection as string[]).push('x');
    }).toThrow(TypeError);
  });

  it('merges moves of the same selection within history.nudgeBurstWindow into one entry', () => {
    const s = testStore();
    insertInto(s);
    const window = CONSTANTS.get('history.nudgeBurstWindow');
    expect(window).toBe(1000);
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    s.clock.advance(999);
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    s.clock.advance(1000);
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    expect(s.store.getState().history.past.map((t) => t.command)).toEqual(['element.insert', 'position.move']);
    s.clock.advance(1001);
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    expect(s.store.getState().history.past.map((t) => t.command)).toEqual(['element.insert', 'position.move', 'position.move']);
    const id = s.store.getState().selection[0] ?? '';
    expect(locate(s.store.getState().document, id)?.node.styles.desktop?.base?.left).toBe('4px');
    s.store.dispatch('history.undo', {});
    expect(locate(s.store.getState().document, id)?.node.styles.desktop?.base?.left).toBe('3px');
    s.store.dispatch('history.undo', {});
    expect(locate(s.store.getState().document, id)?.node.styles.desktop?.base).toBeUndefined();
  });

  it('never merges moves when another command came in between, even one that records nothing (spec absolute-nudge)', () => {
    const s = testStore();
    insertInto(s);
    const id = s.store.getState().selection[0] ?? '';
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    // selecting the node that is already selected changes nothing and records nothing
    s.store.dispatch('selection.select', { target: id });
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    // a command that is not available yet is a command in between as well
    s.store.dispatch('timeline.stop', {});
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    expect(s.store.getState().history.past.map((t) => t.command)).toEqual(['element.insert', 'position.move', 'position.move', 'position.move']);
  });

  it('refuses a command the manifest records per dispatch inside a gesture (history.transaction)', () => {
    const s = testStore();
    insertInto(s);
    const id = s.store.getState().selection[0] ?? '';
    const gesture = s.store.gesture();
    expect(() => gesture.dispatch('element.rename', { target: id, name: 'Inside' })).toThrow(/one transaction per dispatch/);
    gesture.cancel();
  });

  it('never merges moves of different selections', () => {
    const s = testStore();
    insertInto(s);
    const first = s.store.getState().selection[0] ?? '';
    insertInto(s);
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    s.store.dispatch('selection.select', { target: first });
    s.store.dispatch('position.move', { dx: 1, dy: 0 });
    expect(s.store.getState().history.past.map((t) => t.command)).toEqual(['element.insert', 'element.insert', 'position.move', 'position.move']);
  });

  it('makes one transaction and one entry of everything a gesture dispatches', () => {
    const s = testStore();
    const initial = s.store.getState();
    const gesture = s.store.gesture();
    gesture.dispatch('element.insert', { entry: 'container' });
    gesture.dispatch('geometry.resize', { width: '100px' });
    gesture.dispatch('geometry.resize', { width: '120px' });
    // the state follows the gesture as it goes, and the history waits for its end
    expect(s.store.getState().history.past).toHaveLength(0);
    expect(() => s.store.dispatch('history.undo', {})).toThrow(/gesture is open/);
    gesture.commit();
    const after = s.store.getState();
    expect(after.history.past).toHaveLength(1);
    expect(after.history.past[0]?.selectionBefore).toEqual([]);
    s.store.dispatch('history.undo', {});
    expect(s.store.getState().document).toEqual(initial.document);
    expect(s.store.getState().selection).toEqual([]);
    s.store.dispatch('history.redo', {});
    expect(s.store.getState().document).toEqual(after.document);
    expect(s.store.getState().selection).toEqual(after.selection);
  });

  it('restores the state from before a cancelled gesture and records nothing', () => {
    const s = testStore();
    insertInto(s);
    const before = s.store.getState();
    const gesture = s.store.gesture();
    gesture.dispatch('geometry.resize', { width: '300px' });
    gesture.cancel();
    expect(s.store.getState().document).toEqual(before.document);
    expect(s.store.getState().selection).toEqual(before.selection);
    expect(s.store.getState().history).toEqual(before.history);
    expect(() => gesture.dispatch('geometry.resize', { width: '1px' })).toThrow(/closed/);
  });

  it('refuses to build a store where a built command has no registered availability predicate', () => {
    const ids = sequentialIds('n');
    const { hasSelection, ...withoutHasSelection } = TEST_PREDICATES;
    expect(hasSelection.id).toBe('hasSelection');
    expect(() =>
      createStore<EditorUi>({
        table: TEST_COMMANDS,
        predicates: withoutHasSelection,
        commands: MANIFEST_COMMANDS,
        constants: CONSTANTS,
        rules: RULES,
        clock: manualClock(),
        ids,
        words: WORDS,
        initial: { document: emptyDocument(ids), ui: initialEditorUi(INITIAL_PREFERENCES) },
        freeze: true,
      }),
    ).toThrow(/predicate "hasSelection" is not registered/);
  });

  it('notifies subscribers after each committed change, and stops when unsubscribed', () => {
    const s = testStore();
    let calls = 0;
    const off = s.store.subscribe(() => calls++);
    insertInto(s);
    s.store.dispatch('timeline.stop', {});
    expect(calls).toBe(1);
    off();
    insertInto(s);
    expect(calls).toBe(1);
  });
});

// ---- property: any sequence of commands, undos and redos

type Step = { kind: 'insert'; parent: number } | { kind: 'rename'; target: number; name: string } | { kind: 'delete' } | { kind: 'select'; target: number } | { kind: 'noop' } | { kind: 'undo' } | { kind: 'redo' };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('insert' as const), parent: fc.nat() }),
  fc.record({ kind: fc.constant('rename' as const), target: fc.nat(), name: fc.constantFrom('A', 'B', 'C') }),
  fc.constant({ kind: 'delete' as const }),
  fc.record({ kind: fc.constant('select' as const), target: fc.nat() }),
  fc.constant({ kind: 'noop' as const }),
  fc.constant({ kind: 'undo' as const }),
  fc.constant({ kind: 'redo' as const }),
);

const ids = (doc: DocumentJson): string[] => {
  const out: string[] = [];
  const visit = (node: DocumentJson['pages'][number]['tree']) => {
    out.push(node.id);
    node.children.forEach(visit);
  };
  doc.pages.forEach((p) => visit(p.tree));
  return out;
};

describe('the history, for any sequence of commands, undos and redos', () => {
  it('restores exactly the document and the selection of every earlier and later state, and records only changes', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const s = testStore();
        // the oracle: the states along the history (the document, the selection after the command that led there and
        // the selection just before it), and where the store stands in it
        const timeline: { document: DocumentJson; selection: Selection; before: Selection }[] = [{ document: s.store.getState().document, selection: s.store.getState().selection, before: [] }];
        let at = 0;
        for (const st of steps) {
          const state = s.store.getState();
          const all = ids(state.document);
          const pick = (n: number) => all[n % all.length] ?? s.root;
          const pastBefore = state.history.past.length;
          let moved = false;
          if (st.kind === 'undo') {
            const result = s.store.dispatch('history.undo', {});
            if (at === 0) expect(result.status).toBe('refused');
            else {
              at--;
              moved = true;
            }
          } else if (st.kind === 'redo') {
            const result = s.store.dispatch('history.redo', {});
            if (at === timeline.length - 1) expect(result.status).toBe('refused');
            else {
              at++;
              moved = true;
            }
          } else if (st.kind === 'select') {
            s.store.dispatch('selection.select', { target: pick(st.target) });
            expect(s.store.getState().history.past.length).toBe(pastBefore);
            continue;
          } else {
            const result =
              st.kind === 'insert'
                ? s.store.dispatch('element.insert', { entry: 'container', parent: pick(st.parent) })
                : st.kind === 'rename'
                  ? s.store.dispatch('element.rename', { target: pick(st.target), name: st.name })
                  : st.kind === 'delete'
                    ? s.store.dispatch('element.delete', {})
                    : s.store.dispatch('element.rename', { target: s.root, name: nameOf(state.document, s.root) ?? '' });
            const next = s.store.getState();
            const changed = !deepEqual(next.document, state.document);
            // an entry exactly when the document changed
            expect(next.history.past.length).toBe(changed ? pastBefore + 1 : pastBefore);
            if (result.status !== 'done' || !changed) {
              expect(next.document).toBe(state.document);
              continue;
            }
            timeline.splice(at + 1, timeline.length, { document: next.document, selection: next.selection, before: state.selection });
            at++;
            expect(next.history.future).toHaveLength(0);
          }
          const now = s.store.getState();
          if (moved) {
            expect(now.document).toEqual(timeline[at]?.document);
            // undo restores the selection from just before the undone command; redo the one right after the command
            expect(now.selection).toEqual(st.kind === 'undo' ? timeline[at + 1]?.before : timeline[at]?.selection);
          }
          expect(now.history.past.length).toBe(at);
          expect(now.history.future.length).toBe(timeline.length - 1 - at);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('the command table', () => {
  it('has an entry for every command of the manifest and no other', () => {
    expect(Object.keys(COMMANDS).sort()).toEqual([...MANIFEST_COMMANDS.keys()].sort());
  });

  it('holds, for every built command, the handler registered for that command, and NOT_AVAILABLE_YET for the others', () => {
    const entries = Object.entries(COMMANDS as CommandTable<EditorUi>);
    for (const [id, entry] of entries) {
      if (isBuilt(entry)) expect(entry.command).toBe(id);
    }
    expect(COMMANDS['history.undo']).not.toBe(NOT_AVAILABLE_YET);
    expect(COMMANDS['history.redo']).not.toBe(NOT_AVAILABLE_YET);
  });
});
