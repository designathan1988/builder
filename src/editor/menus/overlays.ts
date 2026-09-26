// Overlays (ARCHITECTURE.md, Command owners): ui.dismiss closes what floats over the editor, today the open menu, by
// its doors: Escape in a menu and a press on the backdrop drawn under an open menu. Which menu is open stays the
// menu's own state (opening a menu is not a command, DESIGN.md); the handler records the dismissal in the editor
// state, and an open menu closes when a dismissal newer than its opening arrives (menu.tsx).
import { registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export interface OverlaysState {
  // how many times the floating overlays have been dismissed
  readonly dismissals: number;
}

export const INITIAL_OVERLAYS: OverlaysState = { dismissals: 0 };

// it also closes the dialog that is open (workspace/dialogs.ts) and the command bar (command-bar/command-bar.ts)
export const dismiss = registerHandler<'ui.dismiss', EditorUi>('ui.dismiss', ({ state }) => {
  const { dialog: _closed, commandBar: _bar, ...rest } = state.ui;
  void _closed;
  void _bar;
  return { kind: 'change', ui: { ...rest, overlays: { dismissals: state.ui.overlays.dismissals + 1 } } };
});
