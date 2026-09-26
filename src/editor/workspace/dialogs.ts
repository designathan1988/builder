// The editor's dialogs (ARCHITECTURE.md, Command owners; spec workspace-settings-dialog): View › Guides & Grids opens
// the Guides & Grids dialog (the Snap settings dialog belongs to snap-toggle-settings). One dialog is open at a time,
// held by the editor state (ui.dialog); opening one changes nothing in the document and records nothing. Escape and
// the dialog's close button close it (ui.dismiss, src/editor/menus/overlays.ts).
import { registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export const openDialog = registerHandler<'workspace.openDialog', EditorUi>('workspace.openDialog', ({ state }, { dialog }) => ({ kind: 'change', ui: { ...state.ui, dialog } }));
