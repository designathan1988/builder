// The context menu (ARCHITECTURE.md, Command owners): contextMenu.open, run by a secondary click on the canvas or on
// a Layers row (spec context-menu). The node it opens on becomes the selection unless it is already selected (a
// secondary click inside a multi-selection keeps it), and the menu opens: the editor state records the opening with
// the number of dismissals so far, so the next dismissal closes it (Escape in the menu, a press on the backdrop, or
// the dismissal that follows a run item, menu.tsx), as for every menu (menus/overlays.ts). Which items it shows (the
// commands that apply to the selection, in the manifest's order) and where (at the pointer, inside the window) is the
// drawing's (src/editor/doors/menu.tsx, ContextMenu). Opening it is never an undo step.
import { message, registerHandler } from '../../core/commands/registry.ts';
import { locate } from '../../core/document/model.ts';
import type { EditorUi } from '../state.ts';

export interface ContextMenuState {
  // the last opening: which one it is (a new opening draws a new menu) and how many dismissals had arrived then
  readonly opened: { readonly count: number; readonly dismissals: number } | null;
}

export const INITIAL_CONTEXT_MENU: ContextMenuState = { opened: null };

// the opening of the context menu while it is open, null while it is closed: a dismissal newer than the opening closes it
export function openContextMenu(ui: EditorUi): ContextMenuState['opened'] {
  const { opened } = ui.contextMenu;
  return opened !== null && opened.dismissals === ui.overlays.dismissals ? opened : null;
}

export const contextMenuOpen = registerHandler<'contextMenu.open', EditorUi>('contextMenu.open', ({ state }, { target }) => {
  const found = locate(state.document, target);
  // every door gives a node of the document (the node under the pointer, a Layers row), so another one is a defect
  if (!found) throw new Error(`contextMenu.open: the document has no node ${target}`);
  const ui: EditorUi = { ...state.ui, contextMenu: { opened: { count: (state.ui.contextMenu.opened?.count ?? 0) + 1, dismissals: state.ui.overlays.dismissals } } };
  if (state.selection.includes(target)) return { kind: 'change', ui };
  return { kind: 'change', ui, selection: [target], message: message('status.selected', { name: found.node.name }) };
});
