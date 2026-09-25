// element.setTag (ARCHITECTURE.md, Command owners; spec semantic-tag-switch): switches the one selected element between
// its equivalent tags. Its door is the Settings tab's HTML tag field, which hands the text it holds.
//  - The text is taken without the spaces around it and in lower case (H4 keeps h4). An empty text, or the tag the
//    element already has, changes nothing and records nothing (history.noChange "no-entry"); the status bar names the
//    element's tag either way, so the field shows it again (Problems in Pager 5).
//  - A locked element, or one inside a locked element, keeps its tag (flags.ts lockRefusal: status.locked.edit or
//    status.locked.byAncestor, Problems in Pager 4).
//  - The equivalent tags are the element type's tag and its alternative tags (elements.json), and no other: a
//    container takes div, section, header, main, footer, nav, aside or article, a Heading h1 to h6, a Paragraph p, span
//    or pre. Any other is refused with status.tag.notEquivalent (Problems in Pager 1).
//  - The new tag must fit where the element is (Problems in Pager 3): the content model's retagRefusal asks each of its
//    rules (closed lists, excluded descendants, interactive content).
//  - A kept tag changes only the node's tag: its type, name, children, text, attributes, classes and styles stay. One
//    undo step; the selection stays; the status bar names the element and its new tag (status.tag.set).
import type { ElementRules } from '../document/validate.ts';
import { locate } from '../document/model.ts';
import { message, registerHandler } from '../commands/registry.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { retagRefusal } from './content-model.ts';

// The tags an element of a type may take: its own and its alternatives (elements.json), each once.
export function equivalentTags(element: ElementRules): readonly string[] {
  return [...new Set(element.tags.filter((tag): tag is string => tag !== null))];
}

const shown = (tag: string | null) => `<${tag ?? ''}>`;

export const setTagCommand = registerHandler('element.setTag', ({ state, rules }, { tag }) => {
  const id = state.selection.length === 1 ? state.selection[0] : undefined;
  const at = id === undefined ? null : locate(state.document, id);
  // the door acts on the one selected element (its adapter's selection); anything else is a defect of the door
  if (at === null) throw new Error(`element.setTag: the door acts on one selected element, not ${JSON.stringify(state.selection)}`);
  if (typeof tag !== 'string') throw new Error('element.setTag: the tag is not a string');
  const node = at.node;
  const element = rules.elements.get(node.type);
  if (element === undefined) throw new Error(`element.setTag: ${node.type} is no element type of elements.json`);
  const typed = tag.trim().toLowerCase();
  if (typed === '' || typed === node.tag) return { kind: 'change', message: message('status.tag.set', { name: node.name, tag: shown(node.tag) }) };
  const locked = lockRefusal(state.document, node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  if (!equivalentTags(element).includes(typed)) return { kind: 'refused', message: message('status.tag.notEquivalent', { tag: shown(typed), name: node.name }) };
  const misplaced = retagRefusal(state.document, rules, node.id, typed);
  if (misplaced !== null) return { kind: 'refused', message: misplaced };
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'tag'], value: typed }], message: message('status.tag.set', { name: node.name, tag: shown(typed) }) };
});
