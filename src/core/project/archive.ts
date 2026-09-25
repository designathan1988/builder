// The project file (ARCHITECTURE.md): what File › Open reads. Foundation part 2 opens a project document, the format
// of the scenario fixtures (manifest/features/fixtures/): the document JSON of model.ts, with its format version. The
// archive with its files, its confirmation before replacing the project and File › Save arrive with project-save-json
// and project-open-json. A file that is not a document the model accepts, or whose version this app cannot read, is
// refused with the reason, and the current document stays as it was. `readProject` is the one reader of a project
// document: File › Open and the autosaved work restored at start (src/editor/persistence/autosave.ts) both load
// through it.
import { message, registerHandler, type Message } from '../commands/registry.ts';
import { DOCUMENT_VERSION, type DocumentJson } from '../document/model.ts';
import { validateDocument, type ModelRules } from '../document/validate.ts';

const invalid = (reason: string): { readonly refused: Message } => ({ refused: message('status.open.invalidArchive', { reason }) });

// A project document read from its parsed JSON: the document when the model accepts it at this app's format
// version, else the refusal naming why (a newer version, or what is wrong with it).
export function readProject(parsed: unknown, rules: ModelRules): { readonly document: DocumentJson } | { readonly refused: Message } {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('it is not a project document');
  const version = (parsed as { version?: unknown }).version;
  if (typeof version === 'number' && version > DOCUMENT_VERSION) return { refused: message('status.open.newerVersion', { version }) };
  if (version !== DOCUMENT_VERSION || !Array.isArray((parsed as { pages?: unknown }).pages)) return invalid('it is not a project document');
  const document = parsed as DocumentJson;
  const first = validateDocument(document, [], rules)[0];
  if (first !== undefined) return invalid(`${first.path}: ${first.message}`);
  return { document };
}

export const openProject = registerHandler('project.open', ({ rules }, args) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.file);
  } catch (error) {
    return { kind: 'refused' as const, message: invalid((error as Error).message).refused };
  }
  const read = readProject(parsed, rules);
  if ('refused' in read) return { kind: 'refused' as const, message: read.refused };
  return { kind: 'load' as const, document: read.document };
});
