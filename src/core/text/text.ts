// text.set (ARCHITECTURE.md, Command owners; spec text-edit-inline): writes a text element's text in one transaction.
// Its doors are the end of an inline edit (Enter, a click outside the edited element) and, later, the inspector's
// text field; each hands the node and the content the edit produced. A line break is stored as "\n" (the renderer
// draws it as <br>). The same text records nothing (the manifest's history.noChange "no-entry"), and the status bar
// says the text is kept either way (spec: "Text kept.").
import { message, registerHandler } from '../commands/registry.ts';
import { locate } from '../document/model.ts';

export const setTextCommand = registerHandler('text.set', ({ state, rules }, { target, content }) => {
  const found = locate(state.document, target);
  // a door hands the node it edits and the string the edit produced; anything else is a defect of the door
  if (!found) throw new Error(`text.set: the document has no node ${target}`);
  if (rules.elements.get(found.node.type)?.content !== 'text') throw new Error(`text.set: ${found.node.name} is no text element`);
  if (typeof content !== 'string') throw new Error('text.set: the content is not a string');
  const kept = message('status.textEdit.committed', { name: found.node.name });
  if (found.node.text === content) return { kind: 'change', message: kept };
  return { kind: 'change', patches: [{ op: 'replace', path: [...found.path, 'text'], value: content }], message: kept };
});
