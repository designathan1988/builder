// Inline text editing (ARCHITECTURE.md, "The text editing surface"; spec text-edit-inline): text.startEdit,
// text.cancelEdit and text.insertLineBreak, and the editor state of an edit (`ui.textEdit`). The edit happens on the
// page itself, in the zoomed iframe: the handlers only record the edit in the editor state, and the canvas frame
// (frame.tsx) has the renderer carry it out on the page (the edited element made editable and focused with the caret
// at the end of its text, a line break inserted at the caret, the element given back its text when the edit ends)
// and has the keymap read the keys on the frame's window meanwhile, in the text-editing key context. What the edit
// holds is kept by text.set (src/core/text/text.ts), whose doors take the node and the text from `editArgs`.
//
// An edit ends when its text is kept (text.set, like any undoable command, ends it: the document may change under
// it), when Escape cancels it, and when the selection is no longer the edited node alone (a click elsewhere, a
// loaded project).
import { message, registerHandler, registerPredicate } from '../../core/commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { StoreState } from '../../core/store/store.ts';
import type { KeyContextId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { Command } from '../../manifest/schema.ts';
import type { EditorUi } from '../state.ts';

export interface TextEditState {
  // the node whose text is edited, or null
  readonly node: NodeId | null;
  // the line breaks asked for (Shift+Enter); the count tells a new request from one carried out
  readonly lineBreaks: number;
}

export const INITIAL_TEXT_EDIT: TextEditState = { node: null, lineBreaks: 0 };

// the key context of the edited text (interactions.json): it inherits nothing, so the tree's keys never reach it
export const TEXT_EDITING: KeyContextId = 'text-editing';

// the elements whose content is a text (elements.json)
const TEXTUAL = new Set<string>(manifest.elements.elements.filter((e) => e.content === 'text').map((e) => e.id));

export const editedNode = (state: StoreState<EditorUi>): NodeId | null => state.ui.textEdit.node;

// whether a node of the document is a text element (a double-click's "text-element")
export function isTextElement(document: DocumentJson, id: NodeId): boolean {
  const found = locate(document, id);
  return found !== null && TEXTUAL.has(found.node.type);
}

const withEdit = (ui: EditorUi, textEdit: TextEditState): EditorUi => ({ ...ui, textEdit });
const ended = (ui: EditorUi): EditorUi => (ui.textEdit.node === null ? ui : withEdit(ui, { ...ui.textEdit, node: null }));

// the one selected node, when it is a text element
function singleText(state: StoreState<EditorUi>): DocNode | null {
  const [only, ...others] = state.selection;
  if (only === undefined || others.length > 0 || !isTextElement(state.document, only)) return null;
  return locate(state.document, only)?.node ?? null;
}

// text.startEdit's availability: one text element selected. Refused, the status bar says why (spec, Problems 3):
// a selection of none or several needs one element, and an element with no text has none to edit.
export const singleTextSelection = registerPredicate<EditorUi>(
  'singleTextSelection',
  (state) => singleText(state) !== null,
  (state) => {
    const [only, ...others] = state.selection;
    if (only === undefined || others.length > 0) return message('status.needsSingleSelection');
    return message('status.textEdit.notText', { name: locate(state.document, only)?.node.name ?? '' });
  },
);

export const startEdit = registerHandler<'text.startEdit', EditorUi>('text.startEdit', ({ state }) => {
  const node = singleText(state);
  if (node === null) return { kind: 'refused', message: message('status.needsSingleSelection') };
  return { kind: 'change', ui: withEdit(state.ui, { ...state.ui.textEdit, node: node.id }), message: message('status.textEdit.editing') };
});

// Escape: the element goes back to the text the document holds; nothing is recorded
export const cancelEdit = registerHandler<'text.cancelEdit', EditorUi>('text.cancelEdit', ({ state }) => {
  const node = state.ui.textEdit.node;
  if (node === null) return { kind: 'change' };
  return { kind: 'change', ui: ended(state.ui), message: message('status.textEdit.cancelled', { name: locate(state.document, node)?.node.name ?? '' }) };
});

// Shift+Enter: a line break at the caret, kept as "\n" when the text is kept (spec, Problems 1)
export const insertLineBreak = registerHandler<'text.insertLineBreak', EditorUi>('text.insertLineBreak', ({ state }) => {
  if (state.ui.textEdit.node === null) return { kind: 'change' };
  return { kind: 'change', ui: withEdit(state.ui, { ...state.ui.textEdit, lineBreaks: state.ui.textEdit.lineBreaks + 1 }) };
});

// The editor state after the selection changed: an edit ends when the selection is no longer its node alone.
export function endOffSelection(state: StoreState<EditorUi>): EditorUi {
  const node = state.ui.textEdit.node;
  if (node === null) return state.ui;
  return state.selection.length === 1 && state.selection[0] === node && locate(state.document, node) !== null ? state.ui : ended(state.ui);
}

// The editor state after a command ran: an undoable command (text.set keeping the text among them) ends the edit.
export function endOnUndoable(state: StoreState<EditorUi>, command: Command): EditorUi {
  return command.history.undoable ? ended(state.ui) : state.ui;
}

// What the page's edited element holds now, read by the renderer; the canvas frame registers the reader.
let reader: (() => string | null) | null = null;
export function registerEditReader(read: () => string | null): () => void {
  reader = read;
  return () => {
    if (reader === read) reader = null;
  };
}

// The arguments a door of the edit takes from it, for the argument names its command declares: the edited node
// (`target`) and the text the edit holds now (`content`). Null while nothing is edited.
export function editArgs(state: StoreState<EditorUi>, command: Command): Record<string, unknown> | null {
  const node = state.ui.textEdit.node;
  if (node === null) return null;
  const names = Object.keys(command.args);
  const args: Record<string, unknown> = {};
  if (names.includes('target')) args.target = node;
  if (names.includes('content')) {
    const content = reader?.() ?? null;
    if (content === null) return null;
    args.content = content;
  }
  return args;
}
