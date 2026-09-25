// element.duplicate (ARCHITECTURE.md, Command owners): every root of the selection (the manifest's adapter.selection
// "roots") is copied whole, with its texts, classes, attributes and styles, and the copy goes right after its
// original in one transaction (spec duplicate, "Result in the document"). Every node of a copy gets a fresh id and a
// name no node of the document has (spec, Problems 1: Pager kept the children's names). The copies become the
// selection, the primary's copy first; undo takes them away and gives back the selection from before (history.ts).
// The page root is never duplicated: the status bar says why and nothing changes.
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { allNodes, walk, type DocNode, type Location } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import type { IdGenerator } from '../ports/ids.ts';
import { selectionRoots } from './remove.ts';

// The name a copy of a node named `name` takes, given the names already taken: the name followed by the first free
// number from 2 ("CardA" → "CardA 2"); a name that already ends in a number counts on from it ("Intro 2" → "Intro 3"),
// so copies of copies do not pile numbers up ("Intro 2 2").
export function copyName(name: string, taken: ReadonlySet<string>): string {
  const space = name.lastIndexOf(' ');
  const tail = space < 0 ? '' : name.slice(space + 1);
  const numbered = tail !== '' && [...tail].every((c) => c >= '0' && c <= '9');
  const stem = numbered ? name.slice(0, space) : name;
  let n = numbered ? Number(tail) + 1 : 2;
  while (taken.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}

// A deep copy of a node with a fresh id and a new name for every node, in document order; each new name is taken as
// soon as it is given, so no two nodes of the copies share one.
function copyOf(node: DocNode, ids: IdGenerator, taken: Set<string>): DocNode {
  const name = copyName(node.name, taken);
  taken.add(name);
  return { ...node, id: ids.next(), name, children: node.children.map((child) => copyOf(child, ids, taken)) };
}

export const duplicateCommand = registerHandler('element.duplicate', ({ state, ids }): Outcome<never> => {
  const roots = selectionRoots(state.document, state.selection);
  // the availability predicate (hasSelection) lets no door run without a selection; a selection of nodes the document
  // lacks is a defect of the store
  if (roots.length === 0) throw new Error('element.duplicate: the selection names no node of the document');
  if (roots.some((r) => r.parent === null)) return { kind: 'refused', message: message('status.duplicate.root') };

  const taken = new Set<string>();
  for (const node of allNodes(state.document)) taken.add(node.name);
  // named in document order, so the first root's copy takes the first free number
  const copies = roots.map((r) => ({ root: r, copy: copyOf(r.node, ids, taken) }));
  // the last root first, so every path taken from the document before the duplicate still points at its node: a copy
  // shifts only the nodes after its original in document order
  const patches: Patch[] = copies
    .slice()
    .reverse()
    .map(({ root, copy }) => ({ op: 'add', path: [...root.path.slice(0, -1), root.index + 1], value: copy }));

  // the primary's copy first: the copy of the root that is, or holds, the primary node
  const primaryId = state.selection[0];
  const holdsPrimary = (r: Location) => primaryId !== undefined && [...walk(r.node)].some((n) => n.id === primaryId);
  const primary = copies.find(({ root }) => holdsPrimary(root)) ?? copies[0];
  if (primary === undefined) throw new Error('element.duplicate: no root to copy');
  const selection = [primary.copy.id, ...copies.filter((c) => c !== primary).map((c) => c.copy.id)];
  return {
    kind: 'change',
    patches,
    selection,
    message: copies.length === 1 ? message('status.duplicated', { name: primary.root.node.name, copy: primary.copy.name }) : message('status.duplicatedMany', { count: copies.length }),
  };
});
