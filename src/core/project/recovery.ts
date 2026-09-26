// Restoring a saved version (ARCHITECTURE.md, Command owners; spec autosave-corruption-recovery): the recovery dialog's
// Restore loads exactly the document of the version it names, read through the project reader every open uses
// (archive.ts); the selection and the history start empty (outcome `load`), and autosave, which kept the corrupted
// record untouched until now, writes it as the current record. A version the reader refuses is refused, naming why.
import { message, registerHandler } from '../commands/registry.ts';
import { readProject } from './archive.ts';

export const restoreVersion = registerHandler('project.restoreVersion', ({ rules, version }, args) => {
  const saved = version?.(args.version);
  if (saved === undefined) throw new Error(`restoreVersion: no saved version ${args.version}`);
  const read = readProject(saved, rules);
  if ('refused' in read) return { kind: 'refused' as const, message: read.refused };
  return { kind: 'load' as const, document: read.document, message: message('status.save.restored') };
});
