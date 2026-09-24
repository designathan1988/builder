// Compile-time proof that the command table is complete. Each expected error below is marked with TypeScript's
// expect-error directive, so npm run typecheck fails if one of them stops being an error. Nothing imports this file.
import { NOT_AVAILABLE_YET, type CommandTable } from '../core/commands/registry.ts';
import { redoCommand } from '../core/history/history.ts';
import type { EditorUi } from '../editor/state.ts';
import { COMMANDS } from './commands.ts';

// every command of the manifest has its entry
export const complete: CommandTable<EditorUi> = COMMANDS;

const { 'history.undo': omitted, ...withoutUndo } = COMMANDS;
// @ts-expect-error a table without the entry of history.undo is not a CommandTable
export const missing: CommandTable<EditorUi> = withoutUndo;

// @ts-expect-error a table with an entry for a command the manifest does not have is not a CommandTable
export const extra: CommandTable<EditorUi> = { ...COMMANDS, 'history.rewind': NOT_AVAILABLE_YET };

// @ts-expect-error the handler of history.redo cannot stand for history.undo
export const misfiled: CommandTable<EditorUi> = { ...COMMANDS, 'history.undo': redoCommand };

export const omittedEntry = omitted;
