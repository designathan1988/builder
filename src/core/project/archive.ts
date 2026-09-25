// The project file (ARCHITECTURE.md): what File › Open reads. Foundation part 2 opens a project document, the format
// of the scenario fixtures (manifest/features/fixtures/): the document JSON of model.ts, with its format version. The
// archive with its files, its confirmation before replacing the project and File › Save arrive with project-save-json
// and project-open-json. A file that is not a document the model accepts, or whose version this app cannot read, is
// refused with the reason, and the current document stays as it was.
import { message, registerHandler } from '../commands/registry.ts';
import { DOCUMENT_VERSION, type DocumentJson } from '../document/model.ts';
import { validateDocument } from '../document/validate.ts';

const invalid = (reason: string) => ({ kind: 'refused' as const, message: message('status.open.invalidArchive', { reason }) });

export const openProject = registerHandler('project.open', ({ rules }, args) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.file);
  } catch (error) {
    return invalid((error as Error).message);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('it is not a project document');
  const version = (parsed as { version?: unknown }).version;
  if (typeof version === 'number' && version > DOCUMENT_VERSION) return { kind: 'refused' as const, message: message('status.open.newerVersion', { version }) };
  if (version !== DOCUMENT_VERSION || !Array.isArray((parsed as { pages?: unknown }).pages)) return invalid('it is not a project document');
  const document = parsed as DocumentJson;
  const problems = validateDocument(document, [], rules);
  const first = problems[0];
  if (first !== undefined) return invalid(`${first.path}: ${first.message}`);
  return { kind: 'load' as const, document };
});
