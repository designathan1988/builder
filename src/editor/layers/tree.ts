// Layers folding (ARCHITECTURE.md): which branches of the Layers tree are folded. It is editor state, kept in memory
// only (spec layers-tree: not saved, not an undo step): folding never changes the document nor the selection. A
// branch that hides a selected node unfolds when the selection changes (spec layers-tree, Problems in Pager 2), so a
// selection made on the canvas always has its row in Layers.
import { registerHandler } from '../../core/commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { StoreState } from '../../core/store/store.ts';
import type { EditorUi } from '../state.ts';

export interface LayersState {
  // the nodes whose branch is folded
  readonly collapsed: readonly NodeId[];
}

export const INITIAL_LAYERS: LayersState = { collapsed: [] };

export const isExpanded = (ui: EditorUi, id: NodeId): boolean => !ui.layers.collapsed.includes(id);

const withCollapsed = (ui: EditorUi, collapsed: readonly NodeId[]): EditorUi => ({ ...ui, layers: { ...ui.layers, collapsed } });

// layers.setExpanded: folds, unfolds or toggles a node's branch; a node without children has no branch
export const setExpanded = registerHandler<'layers.setExpanded', EditorUi>('layers.setExpanded', ({ state }, { target, expanded }) => {
  const found = locate(state.document, target);
  if (!found || found.node.children.length === 0) return { kind: 'change' };
  const { collapsed } = state.ui.layers;
  const folded = collapsed.includes(target);
  const fold = expanded === 'toggle' ? !folded : expanded === 'collapse';
  if (fold === folded) return { kind: 'change' };
  return { kind: 'change', ui: withCollapsed(state.ui, fold ? [...collapsed, target] : collapsed.filter((id) => id !== target)) };
});

// the nodes above a node, from its page's root down to its parent
function ancestorsOf(doc: DocumentJson, id: NodeId): NodeId[] {
  const chain: NodeId[] = [];
  const find = (node: DocNode): boolean => {
    if (node.id === id) return true;
    chain.push(node.id);
    if (node.children.some(find)) return true;
    chain.pop();
    return false;
  };
  return doc.pages.some((page) => find(page.tree)) ? chain : [];
}

// The editor state after the selection changed: every folded branch that hides a selected node unfolds.
export function revealSelection(state: StoreState<EditorUi>): EditorUi {
  const { collapsed } = state.ui.layers;
  if (collapsed.length === 0) return state.ui;
  const hiding = new Set(state.selection.flatMap((id) => ancestorsOf(state.document, id)));
  const kept = collapsed.filter((id) => !hiding.has(id));
  return kept.length === collapsed.length ? state.ui : withCollapsed(state.ui, kept);
}
