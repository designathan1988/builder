// The editor's part of the store state: panel visibility (workspace/panels.ts), the workspace layout
// (workspace/layout.ts), the preferences (preferences/preferences.ts), the keyboard focus requests (focus/focus.ts),
// the overlays' dismissals (menus/overlays.ts) and the folded Layers branches (layers/tree.ts). Each module owns its
// part; this file only composes them.
// Document and selection state live in the core store, never here.
import { INITIAL_FOCUS, type FocusState } from './focus/focus.ts';
import { INITIAL_LAYERS, type LayersState } from './layers/tree.ts';
import { INITIAL_OVERLAYS, type OverlaysState } from './menus/overlays.ts';
import { INITIAL_LAYOUT, type LayoutState } from './workspace/layout.ts';
import { INITIAL_PANELS, type PanelsState } from './workspace/panels.ts';
import type { Preferences } from './preferences/preferences.ts';

export interface EditorUi {
  readonly panels: PanelsState;
  readonly layout: LayoutState;
  readonly preferences: Preferences;
  readonly focus: FocusState;
  readonly overlays: OverlaysState;
  readonly layers: LayersState;
}

export function initialEditorUi(preferences: Preferences): EditorUi {
  return { panels: INITIAL_PANELS, layout: INITIAL_LAYOUT, preferences, focus: INITIAL_FOCUS, overlays: INITIAL_OVERLAYS, layers: INITIAL_LAYERS };
}
