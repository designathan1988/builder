// Taking over editing (ARCHITECTURE.md, Command owners; spec multi-tab-guard): in a read-only tab, Take over editing
// takes the project's editing lock from the tab that holds it (the tab-guard port, outcome `editing`), which starts
// this tab again on the latest saved project, now editing. Nothing in the document changes here.
import { registerHandler } from '../commands/registry.ts';

export const takeOverEditing = registerHandler('project.takeOverEditing', () => ({ kind: 'change' as const, editing: 'take-over' as const }));
