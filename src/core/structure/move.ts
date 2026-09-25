// element.moveTo (ARCHITECTURE.md, Command owners): moves the selection's roots (the selected nodes without those an
// ancestor of which is selected too, remove.ts) to one parent at one index, in document order. The index counts
// the parent's children without the moved nodes, so it is the position the first moved node ends at (spec
// drag-reorder-canvas, "Result in the document": the dragged node is removed from its parent and inserted at the
// proposal's parent and index). The moved nodes stay selected; the status bar says "Moved … to position" among its
// siblings and "Moved … into" another parent (spec drag-drop-inside). A parent inside a moved node (the node itself
// included), a parent that holds no children and a parent the content model does not let hold a moved node refuse
// the move, in that order, and nothing changes. A
// move that leaves every node where it was changes nothing and records no history (the store drops it).
//
// element.moveUp and element.moveDown (ARCHITECTURE.md, Command owners; spec move-up-down): the selection's roots
// (the doors' adapter.selection "roots-same-parent") swap places with their previous (up) or next (down) sibling that
// is not selected, in one transaction; the relative order of the selected nodes is kept and they never leave their
// parent. One command for every door (spec, Problems 2). Roots that do not share one parent are refused; so is a
// press that moves nothing: the first (last) place says "Already at the start (end) of <parent>" and adds no history
// entry. The status bar names the one moved node with its new position among its siblings, or counts several
// (spec, Problems 1). The selection stays as it is.
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate, walk, type DocNode, type DocumentJson, type Selection } from '../document/model.ts';
import { applyPatches, type Patch } from '../history/transaction.ts';
import { selectionRoots } from './remove.ts';

export const moveToCommand = registerHandler('element.moveTo', ({ state, rules }, { parent, index }): Outcome<never> => {
  const moved = selectionRoots(state.document, state.selection);
  // every door moves what is selected (its adapter acts on the selection's roots), never the page itself
  if (moved.length === 0) throw new Error('element.moveTo: nothing is selected');
  const receiver = locate(state.document, parent);
  if (!receiver) throw new Error(`element.moveTo: the document has no node ${parent}`);
  for (const at of moved) if (!at.parent) throw new Error(`element.moveTo: ${at.node.id} is a page, it cannot move`);
  const roots = moved.map((at) => at.node.id);

  // a parent inside a moved node first: a moved leaf itself is refused as that, not as a leaf
  for (const at of moved) for (const inner of walk(at.node)) if (inner.id === parent) return { kind: 'refused', message: message('status.refused.intoItself') };
  if (rules.elements.get(receiver.node.type)?.content !== 'children') return { kind: 'refused', message: message('status.refused.noChildren', { parent: receiver.node.name }) };
  for (const at of moved) {
    const only = receiver.node.tag !== null && at.node.tag !== null ? rules.contentModel.refusal(receiver.node.tag, at.node.tag) : null;
    if (only !== null) return { kind: 'refused', message: message('status.refused.onlyAccepts', { parent: `<${receiver.node.tag ?? ''}>`, children: only.map((t) => `<${t}>`).join(', ') }) };
  }

  // each moved node leaves its place, found again in the document the earlier removals left
  const patches: Patch[] = [];
  let document = state.document;
  for (const at of moved) {
    const now = locate(document, at.node.id);
    if (!now) continue;
    const patch: Patch = { op: 'remove', path: now.path };
    patches.push(patch);
    document = applyPatches(document, [patch]).document;
  }
  // then they arrive, in selection order, from the index on
  const target = locate(document, parent);
  if (!target) throw new Error(`element.moveTo: ${parent} is gone once the moved nodes left`);
  const start = Math.max(0, Math.min(index, target.node.children.length));
  for (const [i, at] of moved.entries()) {
    patches.push({ op: 'add', path: [...target.path, 'children', start + i], value: at.node });
  }

  const count = target.node.children.length + moved.length;
  const first = moved[0];
  // one node: moved among its siblings, or into another parent (spec drag-drop-inside)
  const said =
    moved.length !== 1 || !first
      ? message('status.movedMany', { count: moved.length, parent: receiver.node.name })
      : first.parent?.id === parent
        ? message('status.moved', { name: first.node.name, position: start + 1, count, parent: receiver.node.name })
        : message('status.movedInto', { name: first.node.name, receiver: receiver.node.name, position: start + 1, count });
  return { kind: 'change', patches, selection: roots, message: said };
});

type Direction = 'up' | 'down';

// The patches that move every selected child of the parent one place towards its direction, past the sibling it
// meets there when that sibling is not selected, and the new index of each child that moved.
function shiftAmongSiblings(parent: DocNode, parentPath: readonly (string | number)[], selected: ReadonlySet<string>, direction: Direction): { patches: Patch[]; moved: Map<string, number> } {
  const order = parent.children.slice();
  const patches: Patch[] = [];
  const moved = new Map<string, number>();
  const step = direction === 'up' ? -1 : 1;
  // up walks from the first child, down from the last, so a block of selected siblings at the edge stays put and a
  // node never passes another selected one
  const indexes = order.map((_, i) => i);
  if (direction === 'down') indexes.reverse();
  for (const i of indexes) {
    const node = order[i];
    const other = order[i + step];
    if (node === undefined || other === undefined || !selected.has(node.id) || selected.has(other.id)) continue;
    order[i] = other;
    order[i + step] = node;
    // the child leaves its index and comes back one place further, as the reorder of one list (applied in order)
    patches.push({ op: 'remove', path: [...parentPath, 'children', i] }, { op: 'add', path: [...parentPath, 'children', i + step], value: node });
    moved.set(node.id, i + step);
  }
  return { patches, moved };
}

function move(document: DocumentJson, selection: Selection, direction: Direction): Outcome<never> {
  const roots = selectionRoots(document, selection);
  const first = roots[0];
  // the availability predicate (hasSelection) lets no door run without a selection; a selection of nodes the document
  // lacks is a defect of the store
  if (first === undefined) throw new Error(`element.move${direction === 'up' ? 'Up' : 'Down'}: the selection names no node of the document`);
  const parent = first.parent;
  if (roots.some((r) => r.parent !== parent)) return { kind: 'refused', message: message('status.wrap.needsSameParent') };
  // a page root has no siblings: it is already at the start and at the end of its page
  const within = parent?.name ?? document.pages[first.page]?.name ?? '';
  const edge = message(direction === 'up' ? 'status.move.alreadyFirst' : 'status.move.alreadyLast', { parent: within });
  if (parent === null) return { kind: 'refused', message: edge };
  const { patches, moved } = shiftAmongSiblings(parent, first.path.slice(0, -2), new Set(roots.map((r) => r.node.id)), direction);
  if (patches.length === 0) return { kind: 'refused', message: edge };
  const only = roots.length === 1 ? moved.get(first.node.id) : undefined;
  return {
    kind: 'change',
    patches,
    message:
      only !== undefined
        ? message('status.moved', { name: first.node.name, position: only + 1, count: parent.children.length, parent: parent.name })
        : message('status.movedMany', { count: roots.length, parent: parent.name }),
  };
}

export const moveUpCommand = registerHandler('element.moveUp', ({ state }): Outcome<never> => move(state.document, state.selection, 'up'));
export const moveDownCommand = registerHandler('element.moveDown', ({ state }): Outcome<never> => move(state.document, state.selection, 'down'));
