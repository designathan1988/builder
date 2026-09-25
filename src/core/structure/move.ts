// element.moveUp and element.moveDown (ARCHITECTURE.md, Command owners; spec move-up-down): the selection's roots
// (the doors' adapter.selection "roots-same-parent") swap places with their previous (up) or next (down) sibling that
// is not selected, in one transaction; the relative order of the selected nodes is kept and they never leave their
// parent. One command for every door (spec, Problems 2). Roots that do not share one parent are refused; so is a
// press that moves nothing: the first (last) place says "Already at the start (end) of <parent>" and adds no history
// entry. The status bar names the one moved node with its new position among its siblings, or counts several
// (spec, Problems 1). The selection stays as it is.
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import type { DocNode, DocumentJson, Selection } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { selectionRoots } from './remove.ts';

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
