// The selection (ARCHITECTURE.md, Command owners): which nodes are selected, the primary first. It lives in the
// store beside the document, never in it: selecting changes no document and records no history, and undo and redo
// restore the selection that belonged to the document state they go back to (history.ts).
import { message, registerHandler, registerPredicate } from '../commands/registry.ts';
import { locate } from '../document/model.ts';

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
