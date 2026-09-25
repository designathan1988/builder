// element.insert (ARCHITECTURE.md, Command owners): a new element of a palette entry, placed where the arguments say
// or, without them, where the selection says (spec palette-click-insert, "Hit zones"): with nothing selected, the last
// child of the shown page's root; with a container selected, its last child; with a leaf selected, right after it in
// its parent. The placement follows the content model (src/core/elements/content-model.ts): a parent that does not
// accept the element refuses it and nothing changes, never wrapped in another element (spec, Problems 1 and 2). The
// new element is named by its type in the person's language, with a number when a node already has that name, holds
// its default text and styles (elements.json), and becomes the selection.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { allNodes, locate, type DocNode, type DocumentJson, type Location, type Selection, type Styles } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';

// A name no node of the document has: the base itself, else the base followed by the first free number from 2.
export function uniqueName(document: DocumentJson, base: string): string {
  const taken = new Set<string>();
  for (const node of allNodes(document)) taken.add(node.name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// Where the new element goes: the parent and the index among its children; null when the parent given is no node.
function placement(document: DocumentJson, selection: Selection, rules: ModelRules, parent: NodeId | undefined, index: number | undefined): { readonly parent: Location; readonly index: number } | null {
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

export const insertCommand = registerHandler('element.insert', ({ state, ids, rules, words }, { entry, parent, index }): Outcome<never> => {
  const item = rules.palette.get(entry);
  const element = item === undefined ? undefined : rules.elements.get(item.element);
  // every door offers an entry of the palette, so an unknown one is a defect of the door
  if (item === undefined || element === undefined) throw new Error(`element.insert: the palette has no entry ${entry}`);
  const at = placement(state.document, state.selection, rules, parent, index);
  if (at === null) throw new Error(`element.insert: the document has no node ${String(parent)}`);
  const receiver = at.parent.node;
  if (rules.elements.get(receiver.type)?.content !== 'children') return { kind: 'refused', message: message('status.refused.noChildren', { parent: receiver.name }) };
  const tag = element.tags[0] ?? null;
  const only = receiver.tag !== null && tag !== null ? rules.contentModel.refusal(receiver.tag, tag) : null;
  if (only !== null) return { kind: 'refused', message: message('status.refused.onlyAccepts', { parent: `<${receiver.tag ?? ''}>`, children: only.map((t) => `<${t}>`).join(', ') }) };

  const styles: Styles = Object.keys(element.defaultStyles).length > 0 ? ({ [rules.base.breakpoint]: { [rules.base.state]: element.defaultStyles } } as Styles) : {};
  const holdsText = element.content === 'text' || element.content === 'markup';
  const node: DocNode = {
    id: ids.next(),
    type: item.element,
    name: uniqueName(state.document, words(element.labelKey)),
    tag,
    attributes: {},
    classes: [],
    styles,
    text: holdsText ? (element.defaultTextKey === null ? '' : words(element.defaultTextKey)) : null,
    children: [],
  };
  return {
    kind: 'change',
    patches: [{ op: 'add', path: [...at.parent.path, 'children', at.index], value: node }],
    selection: [node.id],
    message: message('status.placed', { element: node.name, parent: receiver.name, position: at.index + 1, count: receiver.children.length + 1 }),
  };
});
