// The editor's part of the store state: panel visibility (workspace/panels.ts), the workspace layout
// (workspace/layout.ts), the preferences (preferences/preferences.ts), the keyboard focus requests (focus/focus.ts),
// the overlays' dismissals (menus/overlays.ts), the context menu's opening (menus/context-menu.ts), the folded
// Layers branches (layers/tree.ts), the name being edited in Layers (layers/rename.ts), the text being edited on the
// canvas (canvas/text-edit.ts), the drop level and the cancellations of the drags (drag/drag-session.ts) and the
// keyboard's hand (core/structure/hand.ts). Each module owns its part; this file only composes them. Document and
// selection state live in the core store, never here.
import { NO_HAND, type HandState } from '../core/structure/hand.ts';
import { INITIAL_TEXT_EDIT, type TextEditState } from './canvas/text-edit.ts';
import { INITIAL_DRAG_SESSION, type DragSessionState } from './drag/drag-session.ts';
import { INITIAL_FOCUS, type FocusState } from './focus/focus.ts';
import { INITIAL_RENAME, type RenameState } from './layers/rename.ts';
import { INITIAL_LAYERS, type LayersState } from './layers/tree.ts';
import { INITIAL_CONTEXT_MENU, type ContextMenuState } from './menus/context-menu.ts';
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
  readonly contextMenu: ContextMenuState;
  readonly layers: LayersState;
  // the node whose name is edited in its Layers row (spec rename-element)
  readonly rename: RenameState;
  readonly textEdit: TextEditState;
  readonly drag: DragSessionState;
  // the element held by the keyboard's hand and its aim (spec hand-keyboard-move)
  readonly hand: HandState | null;
}

export function initialEditorUi(preferences: Preferences): EditorUi {
  return {
    panels: INITIAL_PANELS,
    layout: INITIAL_LAYOUT,
    preferences,
    focus: INITIAL_FOCUS,
    overlays: INITIAL_OVERLAYS,
    contextMenu: INITIAL_CONTEXT_MENU,
    layers: INITIAL_LAYERS,
    rename: INITIAL_RENAME,
    textEdit: INITIAL_TEXT_EDIT,
    drag: INITIAL_DRAG_SESSION,
    hand: NO_HAND,
  };
}
