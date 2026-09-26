// The project's components (ARCHITECTURE.md, Command owners; spec reusable-components): a component is a named
// definition, a tree of elements kept with the project (the document's `components`), whose instances are real
// subtrees of pages. An instance's root names its component (`component`); each of its elements records the place of the
// definition element it comes from (`componentPart`, the child indexes from the definition's root). The one owner of:
//  - components.create: the one selected element and its subtree become a new component's definition (new ids), named
//    after the element (numbered when the project has a component of that name); the element becomes its first
//    instance. The page root (status.components.root), an instance or an element inside one
//    (status.components.inInstance) and a locked element (status.locked.edit) are refused.
//  - components.insertInstance: a new instance (the definition's elements, each with a new id and a name no element
//    has) placed as element.insert places a tile (core/structure/insert.ts placement), refused as an element is
//    (content-model.ts placementRefusal, a locked parent); it becomes the selection.
//  - components.detach (predicate instanceSelected): the instance's elements forget their component and their parts.
//  - componentHolders: where a style write on an element of an instance goes (core/style/set.ts styleHolders): the
//    definition's element and the same element of every instance of the component, in every page.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, registerPredicate, type Outcome } from '../commands/registry.ts';
import { lineage, locate, type ComponentDefinition, type DocNode, type DocumentJson } from '../document/model.ts';
import { placementRefusal } from '../elements/content-model.ts';
import type { Patch } from '../history/transaction.ts';
import { deepEqual } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { freshName, nodeMaker, placement, type NodeMaker } from '../structure/insert.ts';

const NONE: readonly ComponentDefinition[] = [];
export const componentsOf = (document: DocumentJson): readonly ComponentDefinition[] => document.components ?? NONE;

// the root of the instance a node lies in (the node itself or an ancestor naming a component), or null
export function instanceRootOf(document: DocumentJson, id: NodeId): DocNode | null {
  return lineage(document, id).findLast((node) => node.component !== undefined) ?? null;
}

// An element of a tree as the elements of an instance: its part given, its children's after it; the root names the
// component.
function marked(node: DocNode, part: readonly number[], component: string | null): DocNode {
  const { component: _c, componentPart: _p, ...plain } = node;
  void _c;
  void _p;
  return { ...plain, ...(component !== null ? { component } : {}), componentPart: part, children: node.children.map((child, i) => marked(child, [...part, i], null)) };
}

// An element of an instance as an ordinary element: no component, no part, down its subtree.
function unmarked(node: DocNode): DocNode {
  const { component: _c, componentPart: _p, ...plain } = node;
  void _c;
  void _p;
  return { ...plain, children: node.children.map(unmarked) };
}

// A copy of a tree with new ids (and, given a maker, names no element has), with no instance marks.
function copied(node: DocNode, next: () => NodeId, make: NodeMaker | null): DocNode {
  const plain = unmarked(node);
  return { ...plain, id: next(), name: make === null ? plain.name : freshName(make, plain.name), children: node.children.map((child) => copied(child, next, make)) };
}

// the next free component name: the base, else the base and the first free number from 2
function componentName(document: DocumentJson, base: string): string {
  const taken = new Set(componentsOf(document).map((c) => c.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export const createComponentCommand = registerHandler('components.create', ({ state, ids }): Outcome<never> => {
  const primary = state.selection[0];
  const found = primary === undefined ? null : locate(state.document, primary);
  if (found === null) return { kind: 'change' };
  if (found.parent === null) return { kind: 'refused', message: message('status.components.root') };
  if (instanceRootOf(state.document, found.node.id as NodeId) !== null) return { kind: 'refused', message: message('status.components.inInstance', { name: found.node.name }) };
  const locked = lockRefusal(state.document, found.node.id as NodeId, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const name = componentName(state.document, found.node.name);
  const definition: ComponentDefinition = { name, tree: copied(found.node, () => ids.next() as NodeId, null) };
  const added: Patch = state.document.components === undefined ? { op: 'add', path: ['components'], value: [definition] } : { op: 'add', path: ['components', componentsOf(state.document).length], value: definition };
  return { kind: 'change', patches: [added, { op: 'replace', path: found.path, value: marked(found.node, [], name) }], message: message('status.components.created', { name }) };
});

export const insertInstanceCommand = registerHandler('components.insertInstance', ({ state, ids, rules, words }, { component, parent, index }): Outcome<never> => {
  const definition = componentsOf(state.document).find((c) => c.name === component);
  // every tile stands for a component of the project, so an unknown one is a defect of the door
  if (definition === undefined) throw new Error(`components.insertInstance: the project has no component ${component}`);
  const at = placement(state.document, state.selection, rules, parent, index);
  if (at === null) throw new Error(`components.insertInstance: the document has no node ${String(parent)}`);
  const receiver = at.parent.node;
  const locked = lockRefusal(state.document, receiver.id, 'status.locked.insert');
  if (locked !== null) return { kind: 'refused', message: locked };
  const make = nodeMaker(state.document, rules, ids, words);
  const node = marked(copied(definition.tree, () => ids.next() as NodeId, make), [], definition.name);
  // an instance lies inside no other instance
  const host = instanceRootOf(state.document, receiver.id);
  if (host !== null) return { kind: 'refused', message: message('status.components.inInstance', { name: receiver.name }) };
  const refused = placementRefusal(state.document, rules, receiver.id, [node]);
  if (refused !== null) return { kind: 'refused', message: refused };
  return {
    kind: 'change',
    patches: [{ op: 'add', path: [...at.parent.path, 'children', at.index], value: node }],
    selection: [node.id],
    message: message('status.placed', { element: node.name, parent: receiver.name, position: at.index + 1, count: receiver.children.length + 1 }),
  };
});

// the one selected element is an instance's root
export const instanceSelected = registerPredicate('instanceSelected', (state) => {
  const [only, ...others] = state.selection;
  return only !== undefined && others.length === 0 && locate(state.document, only)?.node.component !== undefined;
});

export const detachInstanceCommand = registerHandler('components.detach', ({ state }): Outcome<never> => {
  const primary = state.selection[0];
  const found = primary === undefined ? null : locate(state.document, primary);
  if (found === null || found.node.component === undefined) return { kind: 'change' };
  return { kind: 'change', patches: [{ op: 'replace', path: found.path, value: unmarked(found.node) }], message: message('status.components.detached', { name: found.node.name }) };
});

// What a style write on an element goes to, when the element belongs to an instance: the definition's element (its
// path in the project's components, its parent there) and the element of the same part of every instance of the
// component in every page; null for an element of no instance, or one added to its instance alone.
export function componentHolders(document: DocumentJson, id: NodeId): { readonly node: DocNode; readonly path: readonly (string | number)[]; readonly parent: DocNode | null }[] | null {
  const found = locate(document, id);
  const part = found?.node.componentPart;
  const root = found === null ? null : instanceRootOf(document, found.node.id as NodeId);
  if (found === null || part === undefined || root === null || root.component === undefined) return null;
  const index = componentsOf(document).findIndex((c) => c.name === root.component);
  const definition = componentsOf(document)[index];
  if (definition === undefined) return null;
  // the definition's element of that part, and its parent
  let node: DocNode | undefined = definition.tree;
  let parent: DocNode | null = null;
  const path: (string | number)[] = ['components', index, 'tree'];
  for (const i of part) {
    parent = node ?? null;
    node = node?.children[i];
    path.push('children', i);
  }
  if (node === undefined) return null;
  const holders = [{ node, path, parent }];
  // the same part of every instance of the component
  const visit = (at: DocNode, atPath: (string | number)[], atParent: DocNode | null, instanceOf: string | null) => {
    const within = at.component ?? instanceOf;
    if (within === root.component && at.componentPart !== undefined && deepEqual(at.componentPart, part)) holders.push({ node: at, path: atPath, parent: atParent });
    at.children.forEach((child, i) => visit(child, [...atPath, 'children', i], at, within));
  };
  document.pages.forEach((page, i) => visit(page.tree, ['pages', i, 'tree'], null, null));
  return holders;
}
