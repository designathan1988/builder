import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { COMMANDS, PREDICATES } from '../../app/commands.ts';
import type { DocumentJson } from '../../core/document/model.ts';
import { locate } from '../../core/document/model.ts';
import { rulesFromManifest } from '../../core/document/validate.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { createStore } from '../../core/store/store.ts';
import type { CommandId, ConstantId, MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import { clickDoor, editEndDoor, type Press } from '../input/pointer.ts';
import { INITIAL_PREFERENCES } from '../preferences/preferences.ts';
import { initialEditorUi, type EditorUi } from '../state.ts';
import { editArgs, editedLinkAddress, endOffSelection, endOnUndoable, isTextElement, openLinkPrompt, registerEditReader } from './text-edit.ts';

const AURORA = fixture as DocumentJson;
const COMMAND = new Map(manifest.commands.map((c) => [c.id as CommandId, c]));
const command = (id: CommandId) => {
  const found = COMMAND.get(id);
  if (!found) throw new Error(id);
  return found;
};

// the store as the editor builds it (src/editor/store.ts): the edit follows the selection and the commands
function editorStore() {
  return createStore<EditorUi>({
    table: COMMANDS,
    predicates: PREDICATES,
    commands: COMMAND,
    constants: new Map(manifest.interactions.constants.map((c) => [c.id as ConstantId, c.value])),
    rules: rulesFromManifest(manifest.elements, manifest.properties, manifest.html),
    clock: manualClock(0),
    ids: sequentialIds('t'),
    words: (ui, key: MessageId) => translate(ui.preferences.locale, key),
    initial: { document: AURORA, ui: initialEditorUi(INITIAL_PREFERENCES) },
    freeze: true,
    followSelection: endOffSelection,
    followCommand: endOnUndoable,
  });
}
const textOf = (doc: DocumentJson, id: string) => locate(doc, id)?.node.text;

describe('inline text editing', () => {
  it('starts only on one selected text element, and says why otherwise', () => {
    const store = editorStore();
    expect(store.dispatch('text.startEdit', {})).toEqual({ status: 'refused', message: { key: 'status.needsSingleSelection', params: {} } });
    store.dispatch('selection.select', { target: 'n-hero' });
    expect(store.dispatch('text.startEdit', {})).toEqual({ status: 'refused', message: { key: 'status.textEdit.notText', params: { name: 'Hero' } } });
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('selection.add', { target: 'n-title' });
    expect(store.dispatch('text.startEdit', {}).status).toBe('refused');
    store.dispatch('selection.select', { target: 'n-intro' });
    expect(store.dispatch('text.startEdit', {}).status).toBe('done');
    expect(store.getState().ui.textEdit.node).toBe('n-intro');
    expect(store.getState().message).toEqual({ key: 'status.textEdit.editing', params: {} });
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('does not start on a locked text, nor on one inside a locked element, and says what to unlock (spec lock-element)', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('element.toggleLock', { target: 'n-intro' });
    expect(store.dispatch('text.startEdit', {})).toEqual({ status: 'refused', message: { key: 'status.locked.editText', params: { name: 'Intro' } } });
    store.dispatch('element.toggleLock', { target: 'n-intro' });
    store.dispatch('element.toggleLock', { target: 'n-hero' });
    store.dispatch('selection.select', { target: 'n-title' });
    expect(store.dispatch('text.startEdit', {})).toEqual({ status: 'refused', message: { key: 'status.locked.byAncestor', params: { name: 'Title', ancestor: 'Hero' } } });
    expect(store.getState().ui.textEdit.node).toBeNull();
    store.dispatch('element.toggleLock', { target: 'n-hero' });
    expect(store.dispatch('text.startEdit', {}).status).toBe('done');
  });

  it('asks for a line break at the caret only while editing, and Escape ends the edit recording nothing', () => {
    const store = editorStore();
    store.dispatch('text.insertLineBreak', {});
    expect(store.getState().ui.textEdit).toEqual({ node: null, lineBreaks: 0, selectAlls: 0, changes: 0, change: null, linkPrompt: null });
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    store.dispatch('text.insertLineBreak', {});
    store.dispatch('text.insertLineBreak', {});
    expect(store.getState().ui.textEdit).toEqual({ node: 'n-intro', lineBreaks: 2, selectAlls: 0, changes: 0, change: null, linkPrompt: null });
    store.dispatch('text.cancelEdit', {});
    expect(store.getState().ui.textEdit.node).toBeNull();
    expect(store.getState().message).toEqual({ key: 'status.textEdit.cancelled', params: { name: 'Intro' } });
    expect(store.getState().document).toBe(AURORA);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('ends when the text is kept (an undoable command), and when the selection leaves the edited node', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    store.dispatch('text.set', { target: 'n-intro', content: 'Hello\nworld' });
    expect(textOf(store.getState().document, 'n-intro')).toBe('Hello\nworld');
    expect(store.getState().ui.textEdit.node).toBeNull();
    expect(store.getState().history.past).toHaveLength(1);
    // the same text kept records nothing, and ends the edit too
    store.dispatch('text.startEdit', {});
    store.dispatch('text.set', { target: 'n-intro', content: 'Hello\nworld' });
    expect(store.getState().ui.textEdit.node).toBeNull();
    expect(store.getState().history.past).toHaveLength(1);
    store.dispatch('text.startEdit', {});
    store.dispatch('selection.select', { target: 'n-title' });
    expect(store.getState().ui.textEdit.node).toBeNull();
  });

  it("hands a door of the edit the node and the text the page's element holds, for the arguments it declares", () => {
    const store = editorStore();
    const stop = registerEditReader(() => ({ runs: ['typed'], range: null }));
    expect(editArgs(store.getState(), command('text.set'))).toBeNull();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    expect(editArgs(store.getState(), command('text.set'))).toEqual({ target: 'n-intro', content: 'typed' });
    expect(editArgs(store.getState(), command('text.cancelEdit'))).toEqual({});
    stop();
    // no page to read the text from: no door of the edit runs
    expect(editArgs(store.getState(), command('text.set'))).toBeNull();
  });

  it("finds a press's doors of the edit on the canvas: a double-click on a text element, a press outside the edited one", () => {
    const intro: Press = { on: 'node', node: 'n-intro', root: false };
    const title: Press = { on: 'node', node: 'n-title', root: false };
    const stage: Press = { on: 'stage' };
    const text = { textual: true, edited: null };
    expect(clickDoor(intro, 'primary', 2, null, text)?.ref).toBe('text.startEdit#canvas-double-click-text-element');
    expect(clickDoor(intro, 'primary', 2, null, { textual: false, edited: null })).toBeNull();
    expect(clickDoor({ on: 'node', node: 'n-page', root: true }, 'primary', 2, null, text)).toBeNull();
    const editing = { textual: true, edited: 'n-intro' };
    expect(editEndDoor(title, 'primary', 1, null, editing)?.ref).toBe('text.set#canvas-click-outside-edited-element');
    expect(editEndDoor(stage, 'primary', 1, null, editing)?.ref).toBe('text.set#canvas-click-outside-edited-element');
    expect(editEndDoor(intro, 'primary', 1, null, editing)).toBeNull();
    expect(editEndDoor(title, 'primary', 1, null, text)).toBeNull();
    // the press's own door is never the one that keeps the text
    expect(clickDoor(title, 'primary', 1, null, editing)?.ref).toBe('selection.select#canvas-click-element-or-page');
  });

  it('asks for a mark toggled only while editing (spec text-inline-formatting): Ctrl+B bold, Ctrl+I italic', () => {
    const store = editorStore();
    store.dispatch('text.toggleBold', {});
    expect(store.getState().ui.textEdit.changes).toBe(0);
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    store.dispatch('text.toggleBold', {});
    expect(store.getState().ui.textEdit).toMatchObject({ changes: 1, change: { kind: 'mark', mark: 'strong' } });
    store.dispatch('text.toggleItalic', {});
    expect(store.getState().ui.textEdit).toMatchObject({ changes: 2, change: { kind: 'mark', mark: 'em' } });
    // nothing is written until the text is kept
    expect(store.getState().document).toBe(AURORA);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('opens the link prompt for an address, refuses one that is not allowed and keeps the prompt, and closes it with the address', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    store.dispatch('text.editLink', {});
    expect(openLinkPrompt(store.getState().ui)).toEqual({ count: 1, dismissals: 0 });
    expect(store.getState().message).toEqual({ key: 'status.link.asking', params: {} });
    expect(store.dispatch('text.editLink', { href: 'javascript:alert(1)' })).toEqual({ status: 'refused', message: { key: 'status.link.unsafe', params: {} } });
    expect(openLinkPrompt(store.getState().ui)).not.toBeNull();
    expect(store.getState().ui.textEdit.changes).toBe(0);
    store.dispatch('text.editLink', { href: ' https://example.com ' });
    expect(openLinkPrompt(store.getState().ui)).toBeNull();
    expect(store.getState().ui.textEdit).toMatchObject({ changes: 1, change: { kind: 'link', href: 'https://example.com' } });
    // an empty address removes the link
    store.dispatch('text.editLink', {});
    store.dispatch('text.editLink', { href: '' });
    expect(store.getState().ui.textEdit).toMatchObject({ changes: 2, change: { kind: 'link', href: null }, linkPrompt: null });
    expect(store.getState().document).toBe(AURORA);
  });

  it('closes the link prompt on a dismissal (its backdrop) and when the edit ends', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    store.dispatch('text.editLink', {});
    store.dispatch('ui.dismiss', {});
    expect(openLinkPrompt(store.getState().ui)).toBeNull();
    expect(store.getState().ui.textEdit.node).toBe('n-intro');
    store.dispatch('text.editLink', {});
    expect(openLinkPrompt(store.getState().ui)).not.toBeNull();
    store.dispatch('text.cancelEdit', {});
    expect(store.getState().ui.textEdit.linkPrompt).toBeNull();
  });

  it('pastes what the clipboard held as marked text, and refuses an empty or unreadable clipboard', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    expect(store.dispatch('text.paste', { clipboard: { status: 'denied' } })).toEqual({ status: 'refused', message: { key: 'status.clipboard.denied', params: {} } });
    expect(store.dispatch('text.paste', { clipboard: { status: 'read', html: null, text: null } })).toEqual({ status: 'refused', message: { key: 'status.paste.empty', params: {} } });
    expect(store.dispatch('text.paste', { clipboard: { status: 'read', html: [{ tag: 'script', href: null, children: ['alert(1)'] }], text: null } }).status).toBe('refused');
    expect(store.getState().ui.textEdit.changes).toBe(0);
    store.dispatch('text.paste', { clipboard: { status: 'read', html: [{ tag: 'b', href: null, children: ['RICH'] }, ' x'], text: 'RICH x' } });
    expect(store.getState().ui.textEdit).toMatchObject({ changes: 1, change: { kind: 'insert', runs: [{ tag: 'strong', children: ['RICH'] }, ' x'] } });
    expect(store.getState().document).toBe(AURORA);
  });

  it('hands text.set the tree of runs when something in the edited text is marked, the plain text otherwise', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('text.startEdit', {});
    const stop = registerEditReader(() => ({ runs: ['Fresh ', { tag: 'strong', children: ['coffee'] }], range: { start: 6, end: 12 } }));
    expect(editArgs(store.getState(), command('text.set'))).toEqual({ target: 'n-intro', content: ['Fresh ', { tag: 'strong', children: ['coffee'] }] });
    expect(editedLinkAddress()).toBeNull();
    stop();
    const linked = registerEditReader(() => ({ runs: [{ tag: 'a', href: 'https://example.com', children: ['Fresh'] }, ' coffee'], range: { start: 2, end: 2 } }));
    expect(editedLinkAddress()).toBe('https://example.com');
    linked();
    // a node that holds marks: an edit that took them all off hands its whole tree, so the marks go
    store.dispatch('text.set', { target: 'n-intro', content: [{ tag: 'strong', children: ['Fresh'] }, ' coffee, roasted every week.'] });
    expect(locate(store.getState().document, 'n-intro')?.node.inline).toEqual([{ tag: 'strong', children: ['Fresh'] }, ' coffee, roasted every week.']);
    store.dispatch('text.startEdit', {});
    const plain = registerEditReader(() => ({ runs: ['Fresh coffee, roasted every week.'], range: null }));
    expect(editArgs(store.getState(), command('text.set'))).toEqual({ target: 'n-intro', content: ['Fresh coffee, roasted every week.'] });
    store.dispatch('text.set', { target: 'n-intro', content: ['Fresh coffee, roasted every week.'] });
    expect(locate(store.getState().document, 'n-intro')?.node).not.toHaveProperty('inline');
    plain();
  });

  it('knows the text elements of the manifest', () => {
    expect(isTextElement(AURORA, 'n-intro')).toBe(true);
    expect(isTextElement(AURORA, 'n-title')).toBe(true);
    expect(isTextElement(AURORA, 'n-hero')).toBe(false);
    expect(isTextElement(AURORA, 'missing')).toBe(false);
  });
});

describe("Escape in the inspector's text field (spec inspector-panel)", () => {
  it('says the text of the one selected text element is kept unchanged, recording nothing, when nothing is edited in place', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    const before = store.getState();
    expect(store.dispatch('text.cancelEdit', {}).status).toBe('done');
    expect(store.getState().message).toEqual({ key: 'status.textEdit.cancelled', params: { name: 'Intro' } });
    expect(store.getState().document).toBe(before.document);
    expect(store.getState().history).toBe(before.history);
    expect(store.getState().ui.textEdit).toBe(before.ui.textEdit);
  });

  it('says nothing without one selected text element', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-hero' });
    const before = store.getState();
    store.dispatch('text.cancelEdit', {});
    expect(store.getState().message).toBe(before.message);
  });
});
