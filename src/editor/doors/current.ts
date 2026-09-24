// Whether a door stands for the current state (a checked menu item, the active tab, the pressed segment), read
// from the editor state for the commands that exist, and from DESIGN.md's defaults for the ones not built yet (the
// Canvas view, the base breakpoint, the Style tab, two columns in Insert).
import type { EditorState } from '../store.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { manifest } from '../../manifest/runtime.ts';
import { isPanelOpen, type Panel } from '../workspace/panels.ts';

const BASE_BREAKPOINT = manifest.properties.breakpoints.find((b) => b.base)?.id ?? null;

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
    case 'view.setEditorView':
      return a.view === 'canvas';
    case 'view.setBreakpoint':
      return a.breakpoint === BASE_BREAKPOINT;
    case 'workspace.setActiveTab':
      return a.group === 'inspector' ? a.panel === 'style' : false;
    case 'palette.setDensity':
      return a.density === 'two-columns';
    case 'inspector.setMode':
      return a.mode === 'all';
    default:
      return false;
  }
}
