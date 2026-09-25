// The selection (ARCHITECTURE.md, Command owners): which nodes are selected, the primary first. It lives in the
// store beside the document, never in it: selecting changes no document and records no history, and undo and redo
// restore the selection that belonged to the document state they go back to (history.ts).
import { message, registerHandler, registerPredicate, type Outcome } from '../commands/registry.ts';
import { locate, type DocNode, type Location } from '../document/model.ts';
import type { StoreState } from '../store/store.ts';

// selection.clear's availability: something is selected (refused with "Select an element first." otherwise)
export const hasSelection = registerPredicate('hasSelection', (state) => state.selection.length > 0);

// selection.select: the node alone becomes the selection; the status bar names it. Every door gives a node of the
// document (a canvas click, a Layers row), so a node the document lacks is a defect of the door.
export const selectCommand = registerHandler('selection.select', ({ state }, { target }) => {
  const found = locate(state.document, target);
  if (!found) throw new Error(`selection.select: the document has no node ${target}`);
  return { kind: 'change', selection: [target], message: message('status.selected', { name: found.node.name }) };
});

// selection.clear: nothing is selected any more
export const clearSelectionCommand = registerHandler('selection.clear', () => ({ kind: 'change', selection: [], message: message('status.selection.cleared') }));

// The walk of the tree with the arrow keys (spec keyboard-tree-walk): one level per key from the primary node, the
// node reached alone becomes the selection and the status bar names it; at an end the selection stays and the status
// bar says why. Siblings are the parent's children, hidden or locked included; the page root is reached from its
// children and has no parent. Walking changes no document and records no history.
function walkFrom(state: StoreState<never>): Location {
  const primary = state.selection[0];
  const found = primary === undefined ? null : locate(state.document, primary);
  // the availability predicate (hasSelection) lets no door run without a selection; a selected node the document
  // lacks is a defect of the store
  if (!found) throw new Error('a walk of the tree: the selection names no node of the document');
  return found;
}
const reach = (node: DocNode): Outcome<never> => ({ kind: 'change', selection: [node.id], message: message('status.selected', { name: node.name }) });

// selection.walkNextSibling (ArrowRight): the next sibling; refused on the last child and on the page root
export const walkNextSiblingCommand = registerHandler('selection.walkNextSibling', ({ state }) => {
  const at = walkFrom(state);
  const next = at.parent?.children[at.index + 1];
  if (next) return reach(next);
  return { kind: 'refused', message: message('status.walk.noNext', { parent: at.parent?.name ?? state.document.pages[at.page]?.name ?? '' }) };
});

// selection.walkPreviousSibling (ArrowLeft): the previous sibling; refused on the first child and on the page root
export const walkPreviousSiblingCommand = registerHandler('selection.walkPreviousSibling', ({ state }) => {
  const at = walkFrom(state);
  const previous = at.index > 0 ? at.parent?.children[at.index - 1] : undefined;
  if (previous) return reach(previous);
  return { kind: 'refused', message: message('status.walk.noPrevious', { parent: at.parent?.name ?? state.document.pages[at.page]?.name ?? '' }) };
});

// selection.walkParent (ArrowUp): the parent, the page root included (unlike Pager); refused at the page root
export const walkParentCommand = registerHandler('selection.walkParent', ({ state }) => {
  const at = walkFrom(state);
  if (at.parent) return reach(at.parent);
  return { kind: 'refused', message: message('status.walk.atRoot') };
});

// selection.walkFirstChild (ArrowDown): the first child; refused on a node without children
export const walkFirstChildCommand = registerHandler('selection.walkFirstChild', ({ state }) => {
  const at = walkFrom(state);
  const first = at.node.children[0];
  if (first) return reach(first);
  return { kind: 'refused', message: message('status.walk.noChildren', { name: at.node.name }) };
});
