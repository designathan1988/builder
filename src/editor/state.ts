// The editor's part of the store state: panel visibility (workspace/panels.ts), the workspace layout
// (workspace/layout.ts) and the preferences (preferences/preferences.ts). Each module owns its part; this file only
// composes them. Document and selection state live in the core store, never here.
import { INITIAL_LAYOUT, type LayoutState } from './workspace/layout.ts';
import { INITIAL_PANELS, type PanelsState } from './workspace/panels.ts';
import type { Preferences } from './preferences/preferences.ts';

export interface EditorUi {
  readonly panels: PanelsState;
  readonly layout: LayoutState;
  readonly preferences: Preferences;
}

export function initialEditorUi(preferences: Preferences): EditorUi {
  return { panels: INITIAL_PANELS, layout: INITIAL_LAYOUT, preferences };
}
