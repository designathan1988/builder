// Whether a door stands for the current state (a checked menu item, a pressed toggle), read from the editor state
// the store holds. Only a built command has a state to show: a door whose command is not built yet stands for
// nothing (useDoor asks only for built ones), so no tab, segment or item looks selected before its command exists.
import type { EditorState } from '../store.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { isPanelOpen, type Panel } from '../workspace/panels.ts';

export function isCurrent(entry: DoorEntry, state: EditorState, args: Readonly<Record<string, unknown>> = {}): boolean {
  const a = { ...entry.door.args, ...args };
  const ui = state.ui;
  switch (entry.command.id) {
    case 'preferences.setLanguage':
      return a.locale === ui.preferences.locale;
    case 'preferences.setTheme':
      return a.theme === ui.preferences.theme;
    case 'workspace.setPanelOpen':
      // a toggle shows whether its panel is open; an open or a close button stands for no state
      return a.open === 'toggle' && typeof a.panel === 'string' && isPanelOpen(ui, a.panel as Panel);
    case 'workspace.setWorkbenchState':
      return a.state === 'toggle-max' ? ui.layout.dock === 'max' : ui.layout.dock !== 'collapsed';
    default:
      return false;
  }
}
