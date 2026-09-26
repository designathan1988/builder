// The project as a whole (ARCHITECTURE.md, Command owners; spec new-blank-page): File › New blank page replaces it with
// the empty project, one page whose root holds nothing, named in the words of the person who starts it, as at a first
// start. Over a project that holds work it asks first (outcome `confirm`, the manifest's confirmation); over the empty
// project it does not. The selection and the history start empty (outcome `load`), and autosave writes the blank page.
import { message, registerHandler } from '../commands/registry.ts';
import { createEmptyDocument, isEmptyProject } from '../document/model.ts';

export const newBlankPage = registerHandler('project.newBlankPage', ({ state, ids, rules, words, confirmed }) => {
  if (confirmed !== true && !isEmptyProject(state.document)) return { kind: 'confirm' as const };
  const rootLabel = rules.elements.get(rules.root.type)?.labelKey;
  if (rootLabel === undefined) throw new Error('newBlankPage: the page root has no label');
  const document = createEmptyDocument(ids, { page: words('pages.defaultHome'), root: words(rootLabel) }, rules.root);
  return { kind: 'load' as const, document, message: message('status.project.blankPage') };
});
