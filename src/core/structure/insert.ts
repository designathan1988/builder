// element.insert (ARCHITECTURE.md, Command owners): a new element of a palette entry, placed where the arguments say
// or, without them, where the selection says (spec palette-click-insert, "Hit zones"): with nothing selected, the last
// child of the shown page's root; with a container selected, its last child; with a leaf selected, right after it in
// its parent. The placement follows the content model (src/core/elements/content-model.ts): a parent that does not
// accept the element refuses it and nothing changes, never wrapped in another element (spec, Problems 1 and 2), and so
// does a Link Block, or an element inside one, for an interactive element (spec elements-structure, Problems 5); so
// does a locked parent or one inside a locked element (spec lock-element). The
// new element is named by its type in the person's language, with a number when a node already has that name, holds
// its default text and styles (elements.json), and becomes the selection.
import type { NodeId } from '../../generated/commands.ts';
import type { ElementType, MessageId } from '../../generated/ids.ts';
import type { TemplateNode } from '../../manifest/schema.ts';
import type { WrapperId } from '../document/validate.ts';
import type { IdGenerator } from '../ports/ids.ts';
import { message, registerHandler, registerPredicate, type Message, type Outcome } from '../commands/registry.ts';
import { allNodes, locate, type DocNode, type DocumentJson, type Location, type Selection, type Styles } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { placementRefusal } from '../elements/content-model.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { startingParts } from '../elements/table.ts';

// A name no node of the document has: the base itself, else the base followed by the first free number from 2.
export function uniqueName(document: DocumentJson, base: string): string {
  const taken = new Set<string>();
  for (const node of allNodes(document)) taken.add(node.name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// What makes new nodes: the model, the ids, the person's words, and the names already taken (the document's and those
// of the nodes made so far), so every new node gets a name no other node has.
export interface NodeMaker {
  readonly rules: ModelRules;
  readonly ids: IdGenerator;
  readonly words: (key: MessageId) => string;
  readonly taken: Set<string>;
}

export function nodeMaker(document: DocumentJson, rules: ModelRules, ids: IdGenerator, words: (key: MessageId) => string): NodeMaker {
  return { rules, ids, words, taken: new Set([...allNodes(document)].map((n) => n.name)) };
}

export function freshName(make: NodeMaker, base: string): string {
  let name = base;
  for (let n = 2; make.taken.has(name); n += 1) name = `${base} ${n}`;
  make.taken.add(name);
  return name;
}

// A new element of a type, as element.insert makes it (elements.json): named by its type in the person's language
// (numbered when the name is taken), its first tag, its default styles at the base breakpoint and state, its default
// text, and its natural children (naturalChild: one element of each type, in order, each with its own), so a
// blockquote starts with a paragraph, a list with an item and a definition list with a term and a description. The
// children given replace the natural ones (a table's parts, core/elements/table.ts).
export function newElement(make: NodeMaker, type: string, children?: (make: NodeMaker) => DocNode[], nameKey?: MessageId): DocNode {
  const { rules } = make;
  const element = rules.elements.get(type as ElementType);
  if (element === undefined) throw new Error(`newElement: elements.json defines no ${type}`);
  const holdsText = element.content === 'text' || element.content === 'markup';
  return {
    id: make.ids.next(),
    type: type as ElementType,
    name: freshName(make, make.words(nameKey ?? element.labelKey)),
    tag: element.tags[0] ?? null,
    attributes: {},
    classes: [],
    styles: Object.keys(element.defaultStyles).length > 0 ? ({ [rules.baseLayer.breakpoint]: { [rules.baseLayer.state]: element.defaultStyles } } as Styles) : {},
    text: holdsText ? (element.defaultTextKey === null ? '' : make.words(element.defaultTextKey)) : null,
    children: children === undefined ? element.naturalChildren.map((child) => newElement(make, child)) : children(make),
  };
}

// The tree a template inserts (elements.json palette entries of kind "template"; features templates-layout,
// templates-content, templates-sections, templates-components): each node a new element of its type, then given the
// template's tag, name and text (catalogue keys, in the person's language), the styles of its wrapper (the wrap
// commands' Row and Column, so a template's layout is the wrap commands' layout) and its own, its attributes, and its
// children (when the template names none, the parts a new element of its type starts with: a table's head and body,
// else its natural children). The root is named by the template's label.
export function templateElement(make: NodeMaker, spec: TemplateNode, rootNameKey?: MessageId): DocNode {
  const { rules } = make;
  const nameKey = (spec.nameKey as MessageId | undefined) ?? rootNameKey;
  const base = newElement(make, spec.element, spec.children === undefined ? startingParts(spec.element) : (m) => (spec.children ?? []).map((child) => templateElement(m, child)), nameKey);
  const wrapper = spec.wrapper === undefined ? undefined : rules.wrappers.get(spec.wrapper as WrapperId);
  const styles = { ...(rules.elements.get(spec.element as ElementType)?.defaultStyles ?? {}), ...(wrapper?.styles ?? {}), ...(spec.styles ?? {}) };
  return {
    ...base,
    tag: spec.tag ?? base.tag,
    text: spec.textKey === undefined ? base.text : make.words(spec.textKey as MessageId),
    styles: Object.keys(styles).length > 0 ? ({ [rules.baseLayer.breakpoint]: { [rules.baseLayer.state]: styles } } as Styles) : {},
    attributes: { ...base.attributes, ...(spec.attributes ?? {}) } as DocNode['attributes'],
  };
}

// element.createNaturalChild (feature natural-child-command): a new natural child inside the one selected element
// (elements.json naturalChild), where HTML's permitted order puts it (after the children that come before it or with
// it, so the last of its kind): the first of its natural children that the element may hold only once and lacks (a
// figure's caption), else the first it may hold many of (a list's item, a table body's row); refused when it has none (status.naturalChild.none) or holds every one it may hold once and no other
// (status.naturalChild.present: a details' summary). One undo step; the new child becomes the selection; a locked
// element refuses. The context menu's label names the tag it creates ("Create <li> inside").
function naturalChildToCreate(state: { readonly document: DocumentJson; readonly selection: Selection }, rules: ModelRules): { readonly at: Location; readonly type: string | null } | null {
  const [only, ...others] = state.selection;
  if (only === undefined || others.length > 0) return null;
  const at = locate(state.document, only);
  const natural = at === null ? [] : (rules.elements.get(at.node.type)?.naturalChildren ?? []);
  if (at === null || natural.length === 0) return null;
  const tagOf = (type: string) => rules.elements.get(type as ElementType)?.tags[0] ?? '';
  const holds = (type: string) => at.node.children.some((child) => child.type === type);
  const once = natural.filter((type) => rules.contentModel.unique(at.node.tag ?? '', tagOf(type)));
  const missing = once.find((type) => !holds(type));
  const many = natural.find((type) => !once.includes(type));
  return { at, type: missing ?? many ?? null };
}

// why the selected element takes no new natural child: it has none, or it holds each of them it may hold once
function naturalRefusal(state: { readonly document: DocumentJson; readonly selection: Selection }, rules: ModelRules): Message {
  const [only] = state.selection;
  const at = only === undefined ? null : locate(state.document, only);
  const natural = at === null ? [] : (rules.elements.get(at.node.type)?.naturalChildren ?? []);
  if (at === null || natural.length === 0) return message('status.naturalChild.none', { name: at?.node.name ?? '' });
  const first = rules.elements.get(natural[0] as ElementType)?.tags[0] ?? '';
  return message('status.naturalChild.present', { parent: at.node.name, child: `<${first}>` });
}

export const hasNaturalChild = registerPredicate(
  'hasNaturalChild',
  (state, rules) => naturalChildToCreate(state, rules)?.type != null,
  (state, rules) => naturalRefusal(state, rules),
);

export const createNaturalChildCommand = registerHandler(
  'element.createNaturalChild',
  ({ state, rules, ids, words }): Outcome<never> => {
    const found = naturalChildToCreate(state, rules);
    if (found === null || found.type === null) return { kind: 'refused', message: naturalRefusal(state, rules) };
    const { at, type } = found;
    const locked = lockRefusal(state.document, at.node.id, 'status.locked.insert');
    if (locked !== null) return { kind: 'refused', message: locked };
    const node = newElement(nodeMaker(state.document, rules, ids, words), type);
    const index = rules.contentModel.slotIn(at.node.tag ?? '', at.node.children.map((c) => c.tag ?? ''), node.tag ?? '');
    return {
      kind: 'change',
      patches: [{ op: 'add', path: [...at.path, 'children', index], value: node }],
      selection: [node.id],
      message: message('status.placed', { element: node.name, parent: at.node.name, position: index + 1, count: at.node.children.length + 1 }),
    };
  },
);
createNaturalChildCommand.labelParams = (state, rules) => {
  const type = naturalChildToCreate(state, rules)?.type;
  const tag = type == null ? '' : (rules.elements.get(type as ElementType)?.tags[0] ?? '');
  return { tag: tag === '' ? '' : `<${tag}>` };
};

// Where the new element goes: the parent and the index among its children; null when the parent given is no node.
export function placement(document: DocumentJson, selection: Selection, rules: ModelRules, parent: NodeId | undefined, index: number | undefined): { readonly parent: Location; readonly index: number } | null {
  if (parent !== undefined) {
    const at = locate(document, parent);
    if (!at) return null;
    const count = at.node.children.length;
    return { parent: at, index: index === undefined ? count : Math.max(0, Math.min(index, count)) };
  }
  const primary = selection[0] === undefined ? null : locate(document, selection[0]);
  if (primary && rules.elements.get(primary.node.type)?.content === 'children') return { parent: primary, index: primary.node.children.length };
  if (primary?.parent) {
    const up = locate(document, primary.parent.id);
    if (up) return { parent: up, index: primary.index + 1 };
  }
  const root = document.pages[0]?.tree;
  const at = root === undefined ? null : locate(document, root.id);
  return at === null ? null : { parent: at, index: at.node.children.length };
}

// The new node of a palette entry (elements.json palette): a template's tree, else a new element of the entry's type
// with the parts it starts with; an input tile's node takes its kind of input (the attribute inputType, written type).
export function paletteNode(make: NodeMaker, entry: string): DocNode {
  const item = make.rules.palette.get(entry);
  // every door offers an entry of the palette, so an unknown one is a defect of the door
  if (item === undefined || make.rules.elements.get(item.element) === undefined) throw new Error(`the palette has no entry ${entry}`);
  const made = item.template === null ? newElement(make, item.element, startingParts(item.element)) : templateElement(make, item.template, item.labelKey);
  return item.inputType === null ? made : { ...made, attributes: { ...made.attributes, inputType: item.inputType } };
}

export const insertCommand = registerHandler('element.insert', ({ state, ids, rules, words }, { entry, parent, index }): Outcome<never> => {
  const at = placement(state.document, state.selection, rules, parent, index);
  if (at === null) throw new Error(`element.insert: the document has no node ${String(parent)}`);
  const receiver = at.parent.node;
  // a locked parent, or one inside a locked element, takes no new child (spec lock-element)
  const locked = lockRefusal(state.document, receiver.id, 'status.locked.insert');
  if (locked !== null) return { kind: 'refused', message: locked };
  const node = paletteNode(nodeMaker(state.document, rules, ids, words), entry);
  // the one rule of where elements may go (content-model.ts placementRefusal): the same for every door that inserts
  const refused = placementRefusal(state.document, rules, receiver.id, [node]);
  if (refused !== null) return { kind: 'refused', message: refused };
  return {
    kind: 'change',
    patches: [{ op: 'add', path: [...at.parent.path, 'children', at.index], value: node }],
    selection: [node.id],
    message: message('status.placed', { element: node.name, parent: receiver.name, position: at.index + 1, count: receiver.children.length + 1 }),
  };
});
