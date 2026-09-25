// element.setLink (ARCHITECTURE.md, Command owners; spec elements-structure): the link of a Link Block or a link, its
// attribute `href` (elements.json gives it those element types and this command). Its door is the Settings tab's Link
// address field, which hands the node it stands for and the text it holds (kept on Enter and when the field loses the
// focus, src/editor/shell/inspector.tsx); without a node, the one selected element.
//  - The text is taken without the spaces around it. An empty one removes the link: the element then has no `href`,
//    and nothing invents one (spec, Problems in Pager 4); status.link.removed names the element.
//  - An address the one rule of a link's address does not allow (isSafeHref of src/core/text/inline.ts: http, https,
//    mailto, tel) is refused with status.url.unsafe naming it, and the document keeps its link.
//  - A locked element, or one inside a locked element, keeps its link (spec lock-element): status.locked.edit, or
//    status.locked.byAncestor naming the lock.
//  - The same link records nothing (history.noChange "no-entry"); status.link.set names the element and its link.
//  - Opening in a new tab (elements-text) and the page and anchor of the link picker (link-picker) arrive with their
//    features: no door hands them yet.
import { message, registerHandler } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { isSafeHref } from '../text/inline.ts';

// the attribute that holds a link (elements.json: its command is element.setLink, its value an address)
const LINK = 'href';

export const setLinkCommand = registerHandler('element.setLink', ({ state, rules }, { target, href, newTab, page, anchor }) => {
  // a door hands the address its field holds, for the node it stands for or the one selected element; anything else
  // is a defect of the door
  if (newTab !== undefined || page !== undefined || anchor !== undefined) throw new Error('element.setLink: a new tab, a page and an anchor arrive with elements-text and link-picker');
  if (typeof href !== 'string') throw new Error('element.setLink: the address is not a string');
  const id = target ?? (state.selection.length === 1 ? state.selection[0] : undefined);
  if (id === undefined) throw new Error('element.setLink: no node given and not one element selected');
  const found = locate(state.document, id);
  if (!found) throw new Error(`element.setLink: the document has no node ${id}`);
  const appliesTo = rules.attributes.get(LINK);
  if (appliesTo === undefined || (appliesTo !== 'all' && !appliesTo.includes(found.node.type))) throw new Error(`element.setLink: ${found.node.name} takes no link`);

  const locked = lockRefusal(state.document, found.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const path = [...found.path, 'attributes', LINK];
  const stored = found.node.attributes[LINK];
  const typed = href.trim();
  if (typed === '') {
    const removed = message('status.link.removed', { name: found.node.name });
    return stored === undefined ? { kind: 'change', message: removed } : { kind: 'change', patches: [{ op: 'remove', path }], message: removed };
  }
  if (!isSafeHref(typed)) return { kind: 'refused', message: message('status.url.unsafe', { url: typed }) };
  const set = message('status.link.set', { name: found.node.name, href: typed });
  if (stored === typed) return { kind: 'change', message: set };
  return { kind: 'change', patches: [{ op: stored === undefined ? 'add' : 'replace', path, value: typed }], message: set };
});
