// Node names (ARCHITECTURE.md, Command owners): element.rename (spec rename-element) writes the name a node carries,
// the one Layers shows, the canvas label shows and the export derives its BEM classes from, in one transaction. Its
// door is the end of the rename in place in Layers (src/editor/layers/rename.ts): the row's name field, submitted with
// Enter or left, hands the node and what the field holds. The name kept is that text without the spaces around it.
// An empty name keeps the previous name (spec, Problems in Pager 2: one rule for every door): nothing is written and
// the status bar says so; like the same name, it records nothing (the manifest's history.noChange "no-entry"). Both
// end the rename all the same (an outcome that runs, which the editor state follows), so the field never stays open
// on a name it cannot keep. The name of a locked element, or of one inside a locked element, stays, and the status bar
// says what to unlock (spec lock-element, `lockRefusal`).
import { message, registerHandler } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { lockRefusal } from './flags.ts';

export const renameCommand = registerHandler('element.rename', ({ state }, { target, name }) => {
  const found = locate(state.document, target);
  // the field hands the node of its own row and the string it holds; anything else is a defect of the door
  if (!found) throw new Error(`element.rename: the document has no node ${target}`);
  if (typeof name !== 'string') throw new Error('element.rename: the name is not a string');
  const locked = lockRefusal(state.document, target, 'status.locked.rename');
  if (locked !== null) return { kind: 'refused', message: locked };
  const previous = found.node.name;
  const kept = name.trim();
  if (kept === '') return { kind: 'change', message: message('status.rename.empty', { name: previous }) };
  if (kept === previous) return { kind: 'change' };
  return { kind: 'change', patches: [{ op: 'replace', path: [...found.path, 'name'], value: kept }], message: message('status.renamed', { old: previous, name: kept }) };
});
