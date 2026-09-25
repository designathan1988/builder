// Node flags (ARCHITECTURE.md, Command owners): what a node carries for the editor beside its content.
//
// element.toggleHidden (spec hide-element): hides a node on the canvas with its whole subtree, or shows it again. The
// node stays in the document and in Layers, where it can still be selected; only its hidden flag changes (model.ts:
// true, absent while it shows), so showing it again gives back exactly the layout it had. The page root is never
// hidden: the status bar says why and nothing changes.
//
// element.toggleLock (spec lock-element): locks a node with its whole subtree, or unlocks it. Only its locked flag
// changes (model.ts: true, absent while it is unlocked); a locked node can still be selected and inspected, and every
// command that would move, delete or edit it, or anything inside it, refuses it and names the lock (`lockRefusal`
// below, the one answer to "what locks this node", which every such command asks). The page root is never locked
// (locking it would lock the whole page): the status bar says why and nothing changes.
//
// Both flags: a Layers row's control acts on the node it stands for (its target) and leaves the selection as it is;
// the other doors act on the primary selected node. Each toggle is one undo step, and the status bar says which it was
// for every door (the specs' Problems in Pager 2). A node's own flags stay its own to toggle, except inside a locked
// element, where the toggle is refused with status.locked.byAncestor naming the lock (spec lock-element: only the
// node that carries a lock can be unlocked).
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, type Message, type Outcome } from '../commands/registry.ts';
import { lineage, locate, type DocNode, type DocumentJson, type Location, type Selection } from '../document/model.ts';

// The keys a command refuses a node it would change with, when the node carries the lock itself (en.json
// status.locked.*): "Unlock {name} before deleting it", "… before moving it", and so on.
export type LockedKey = 'status.locked.delete' | 'status.locked.edit' | 'status.locked.editText' | 'status.locked.insert' | 'status.locked.move' | 'status.locked.rename';

// The lock over a node: the outermost locked node among the node itself and its ancestors, or null when nothing locks
// it. The outermost, because it is the one lock that can be taken off first (inside it, a toggle is refused).
export function lockOver(document: DocumentJson, id: NodeId): DocNode | null {
  return lineage(document, id).find((n) => n.locked === true) ?? null;
}

// Why a command may not change a node (spec lock-element, Problems in Pager 1: the message names the lock and says
// what to do), or null when nothing locks it: inside a locked element, status.locked.byAncestor names the node and
// that element; a node that carries the lock itself, with none above it, is refused with the command's own key.
export function lockRefusal(document: DocumentJson, id: NodeId, key: LockedKey): Message | null {
  const chain = lineage(document, id);
  const node = chain.at(-1);
  const lock = chain.find((n) => n.locked === true);
  if (node === undefined || lock === undefined) return null;
  return lock === node ? message(key, { name: node.name }) : message('status.locked.byAncestor', { name: node.name, ancestor: lock.name });
}

// The first refusal over several nodes a command would change, in their order, or null when none is locked.
export function firstLockRefusal(document: DocumentJson, ids: readonly NodeId[], key: LockedKey): Message | null {
  for (const id of ids) {
    const refused = lockRefusal(document, id, key);
    if (refused !== null) return refused;
  }
  return null;
}

// Why a node's own flag may not be toggled: a locked element above it (status.locked.byAncestor), or null.
function ancestorLockRefusal(document: DocumentJson, id: NodeId): Message | null {
  const chain = lineage(document, id);
  const node = chain.at(-1);
  const lock = chain.slice(0, -1).find((n) => n.locked === true);
  return node === undefined || lock === undefined ? null : message('status.locked.byAncestor', { name: node.name, ancestor: lock.name });
}

// the node a door acts on: the one it names, else the primary selected node
function flagged(document: DocumentJson, selection: Selection, target: unknown): Location | null {
  const id = typeof target === 'string' ? (target as NodeId) : selection[0];
  return id === undefined ? null : locate(document, id);
}

// sets a flag of the node, or removes it when it is set, and says which
function toggled(at: Location, flag: 'hidden' | 'locked', on: MessageId, off: MessageId): Outcome<never> {
  const path = [...at.path, flag];
  const name = at.node.name;
  if (at.node[flag] === true) return { kind: 'change', patches: [{ op: 'remove', path }], message: message(off, { name }) };
  return { kind: 'change', patches: [{ op: 'add', path, value: true }], message: message(on, { name }) };
}

export const toggleHiddenCommand = registerHandler(
  'element.toggleHidden',
  ({ state }, { target }): Outcome<never> => {
    const at = flagged(state.document, state.selection, target);
    // the availability predicate (hasSelection) lets no door run without a selection, and a row's eye names a node of
    // the document; anything else is a defect of the door
    if (at === null) throw new Error(`element.toggleHidden: the document has no node ${String(target ?? state.selection[0])}`);
    if (at.parent === null) return { kind: 'refused', message: message('status.hide.root') };
    const locked = ancestorLockRefusal(state.document, at.node.id);
    if (locked !== null) return { kind: 'refused', message: locked };
    return toggled(at, 'hidden', 'status.hidden', 'status.visible');
  },
  // a door stands for the hidden state of the node it acts on: a row's eye is pressed while its node is hidden
  (state, args) => flagged(state.document, state.selection, args.target)?.node.hidden === true,
);

export const toggleLockCommand = registerHandler(
  'element.toggleLock',
  ({ state }, { target }): Outcome<never> => {
    const at = flagged(state.document, state.selection, target);
    // the availability predicate (hasSelection) lets no door run without a selection, and a row's lock names a node of
    // the document; anything else is a defect of the door
    if (at === null) throw new Error(`element.toggleLock: the document has no node ${String(target ?? state.selection[0])}`);
    if (at.parent === null) return { kind: 'refused', message: message('status.lock.root') };
    const locked = ancestorLockRefusal(state.document, at.node.id);
    if (locked !== null) return { kind: 'refused', message: locked };
    return toggled(at, 'locked', 'status.locked', 'status.unlocked');
  },
  // a door stands for the locked state of the node it acts on: a row's lock is pressed while its node carries a lock
  (state, args) => flagged(state.document, state.selection, args.target)?.node.locked === true,
);
