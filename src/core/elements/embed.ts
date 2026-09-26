// element.setEmbedMarkup (ARCHITECTURE.md, Command owners; feature embed-html): the markup of the one selected Embed,
// third-party widget code stored as it is typed or pasted. On the editing canvas the renderer shows it inside a
// sandboxed frame where its scripts never run; the export writes it verbatim at its place. The same markup records
// nothing; a locked element keeps its markup (spec lock-element).
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { lockRefusal } from '../nodes/flags.ts';

export const setEmbedMarkupCommand = registerHandler('element.setEmbedMarkup', ({ state, rules }, { markup, target }): Outcome<never> => {
  const id = target ?? (state.selection.length === 1 ? state.selection[0] : undefined);
  if (id === undefined) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const at = locate(state.document, id);
  if (at === null) throw new Error(`element.setEmbedMarkup: the document has no node ${id}`);
  if (rules.elements.get(at.node.type)?.content !== 'markup') throw new Error(`element.setEmbedMarkup: ${at.node.name} holds no markup`);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const text = String(markup);
  const said = message('status.embed.set', { name: at.node.name });
  if (at.node.text === text) return { kind: 'change', message: said };
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'text'], value: text }], message: said };
});
