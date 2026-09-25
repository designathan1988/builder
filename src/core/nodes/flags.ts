// Node flags (ARCHITECTURE.md, Command owners): what a node carries for the editor beside its content.
//
// element.toggleHidden (spec hide-element): hides a node on the canvas with its whole subtree, or shows it again. The
// node stays in the document and in Layers, where it can still be selected; only its hidden flag changes (model.ts:
// true, absent while it shows), so showing it again gives back exactly the layout it had. A Layers row's eye acts on
// the node it stands for (its target) and leaves the selection as it is; the other doors act on the primary selected
// node. Hiding and showing are each one undo step, and the status bar says which it was for every door (spec,
// Problems in Pager 2). The page root is never hidden: the status bar says why and nothing changes. Refusing inside a
// locked ancestor (status.locked.byAncestor) waits for the lock flag of lock-element.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate, type DocumentJson, type Location, type Selection } from '../document/model.ts';

// the node a door acts on: the one it names, else the primary selected node
function flagged(document: DocumentJson, selection: Selection, target: unknown): Location | null {
  const id = typeof target === 'string' ? (target as NodeId) : selection[0];
  return id === undefined ? null : locate(document, id);
}

export const toggleHiddenCommand = registerHandler(
  'element.toggleHidden',
  ({ state }, { target }): Outcome<never> => {
    const at = flagged(state.document, state.selection, target);
    // the availability predicate (hasSelection) lets no door run without a selection, and a row's eye names a node of
    // the document; anything else is a defect of the door
    if (at === null) throw new Error(`element.toggleHidden: the document has no node ${String(target ?? state.selection[0])}`);
    if (at.parent === null) return { kind: 'refused', message: message('status.hide.root') };
    const path = [...at.path, 'hidden'];
    const name = at.node.name;
    if (at.node.hidden === true) return { kind: 'change', patches: [{ op: 'remove', path }], message: message('status.visible', { name }) };
    return { kind: 'change', patches: [{ op: 'add', path, value: true }], message: message('status.hidden', { name }) };
  },
  // a door stands for the hidden state of the node it acts on: a row's eye is pressed while its node is hidden
  (state, args) => flagged(state.document, state.selection, args.target)?.node.hidden === true,
);
