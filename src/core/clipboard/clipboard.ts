// clipboard.copy and clipboard.paste (ARCHITECTURE.md, Command owners; spec clipboard-copy-paste): elements through
// the system clipboard, never a copy kept in memory (spec, Problems in Pager 2).
//  - Copy writes every selected root (a node no other selected node contains), in document order, with its subtree, in
//    the app's element format: a JSON text naming the format and holding the nodes (ids left out). The document does
//    not change and nothing is recorded; the status bar says what was copied.
//  - Paste reads what the clipboard holds: text in the app's element format gives its nodes, placed like an insert (a
//    selected container takes them as its last children, a selected leaf is followed by them, nothing selected puts them
//    at the end of the page), each with new ids and a name no node has, one undo step, the pasted nodes becoming the
//    selection. Anything else is nothing to paste (status.paste.empty); a clipboard the browser would not read says so
//    (status.clipboard.denied). A parent that does not accept them, a locked parent, or interactive content inside a
//    Link Block refuses, as an insert does.
import type { ClipboardContent, NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { allNodes, locate, type DocNode, type DocumentJson, type Location } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { placementRefusal } from '../elements/content-model.ts';
import { lockRefusal } from '../nodes/flags.ts';
import type { IdGenerator } from '../ports/ids.ts';

// the name of the app's element format, the first field of its JSON text
export const ELEMENTS_FORMAT = 'builder/elements';

type Copied = Omit<DocNode, 'id' | 'children'> & { readonly children: readonly Copied[] };

const withoutIds = (node: DocNode): Copied => {
  const copy: Record<string, unknown> = { ...node, children: node.children.map(withoutIds) };
  delete copy.id;
  return copy as Copied;
};

// the selected nodes no other selected node contains, in document order
function selectedRoots(document: DocumentJson, selection: readonly NodeId[]): DocNode[] {
  const chosen = new Set(selection);
  const inside = (id: NodeId) => {
    for (let at = locate(document, id)?.parent ?? null; at !== null; at = locate(document, at.id)?.parent ?? null) if (chosen.has(at.id)) return true;
    return false;
  };
  return [...allNodes(document)].filter((node) => chosen.has(node.id) && !inside(node.id));
}

export const copyCommand = registerHandler('clipboard.copy', ({ state }): Outcome<never> => {
  const roots = selectedRoots(state.document, state.selection);
  const first = roots[0];
  if (first === undefined) return { kind: 'refused', message: message('refusal.nothingSelected') };
  // the page root is never copied: a paste would put a page inside a page
  if (roots.some((node) => locate(state.document, node.id)?.parent === null)) return { kind: 'refused', message: message('status.copy.root') };
  const text =JSON.stringify({ format: ELEMENTS_FORMAT, nodes: roots.map(withoutIds) });
  return {
    kind: 'change',
    clipboard: { text },
    message: roots.length === 1 ? message('status.copied', { name: first.name }) : message('status.copiedMany', { count: roots.length }),
  };
});

// the nodes a clipboard text in the app's element format holds, or null for any other text
function copiedNodes(text: string | null): Copied[] | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { format?: unknown; nodes?: unknown };
    return parsed.format === ELEMENTS_FORMAT && Array.isArray(parsed.nodes) && parsed.nodes.length > 0 ? (parsed.nodes as Copied[]) : null;
  } catch {
    return null;
  }
}

// a copied subtree given new ids and names no node has (numbered from the copied name: "Title 2")
function fresh(copied: Copied, ids: IdGenerator, taken: Set<string>): DocNode {
  let name = copied.name;
  if (taken.has(name)) {
    const base = name.replace(/ \d+$/, '');
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    name = `${base} ${n}`;
  }
  taken.add(name);
  return { ...copied, id: ids.next(), name, children: copied.children.map((child) => fresh(child, ids, taken)) } as DocNode;
}

// where pasted nodes go: into a selected container, after a selected leaf, else at the end of the page's root
function target(document: DocumentJson, selection: readonly NodeId[], rules: ModelRules): { readonly parent: Location; readonly index: number; readonly after: DocNode | null } | null {
  const primary = selection[0] === undefined ? null : locate(document, selection[0]);
  if (primary !== null && rules.elements.get(primary.node.type)?.content === 'children') return { parent: primary, index: primary.node.children.length, after: null };
  if (primary?.parent) {
    const up = locate(document, primary.parent.id);
    if (up) return { parent: up, index: primary.index + 1, after: primary.node };
  }
  const root = document.pages[0]?.tree;
  const at = root === undefined ? null : locate(document, root.id);
  return at === null ? null : { parent: at, index: at.node.children.length, after: null };
}

export const pasteCommand = registerHandler('clipboard.paste', ({ state, rules, ids }, { clipboard }): Outcome<never> => {
  // Asked before the clipboard is read (the context menu choosing its items, store.canRun): what a paste brings is
  // known only when it runs, which its door reads first, so it runs wherever a paste may land and a locked receiver
  // refuses; nothing changes.
  if (clipboard === undefined) {
    const at = target(state.document, state.selection, rules);
    const locked = at === null ? null : lockRefusal(state.document, at.parent.node.id, 'status.locked.insert');
    return locked === null ? { kind: 'change', message: message('status.paste.empty') } : { kind: 'refused', message: locked };
  }
  const content = clipboard as ClipboardContent;
  if (content.status === 'denied') return { kind: 'refused', message: message('status.clipboard.denied') };
  const copied = copiedNodes(content.text);
  if (copied === null) return { kind: 'refused', message: message('status.paste.empty') };
  const at = target(state.document, state.selection, rules);
  if (at === null) throw new Error('clipboard.paste: the document has no page');
  const receiver = at.parent.node;
  const locked = lockRefusal(state.document, receiver.id, 'status.locked.insert');
  if (locked !== null) return { kind: 'refused', message: locked };
  const taken = new Set([...allNodes(state.document)].map((n) => n.name));
  const nodes = copied.map((node) => fresh(node, ids, taken));
  // the one rule of where elements may go (content-model.ts placementRefusal), as for an insert
  const refused = placementRefusal(state.document, rules, receiver.id, nodes);
  if (refused !== null) return { kind: 'refused', message: refused };
  const first = nodes[0] as DocNode;
  const count = receiver.children.length + nodes.length;
  const said =
    at.after === null
      ? message('status.pasted.inside', { name: first.name, parent: receiver.name, position: at.index + 1, count })
      : message('status.pasted.after', { name: first.name, sibling: at.after.name, position: at.index + 1, count, parent: receiver.name });
  return {
    kind: 'change',
    patches: nodes.map((node, i) => ({ op: 'add' as const, path: [...at.parent.path, 'children', at.index + i], value: node })),
    selection: nodes.map((node) => node.id),
    message: said,
  };
});
