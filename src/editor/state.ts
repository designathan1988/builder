// The editor's part of the store state: panel visibility (workspace/panels.ts), the workspace layout
// (workspace/layout.ts), the preferences (preferences/preferences.ts), the keyboard focus requests (focus/focus.ts),
// the overlays' dismissals (menus/overlays.ts), the context menu's opening (menus/context-menu.ts), the folded
// Layers branches (layers/tree.ts), the name being edited in Layers (layers/rename.ts), the text being edited on the
// canvas (canvas/text-edit.ts), the drop level and the cancellations of the drags (drag/drag-session.ts) and the
// keyboard's hand (core/structure/hand.ts) and the camera's pan (view/camera.ts). Each module owns its part; this file only composes them. Document and
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
import { panelsFor, type PanelsState } from './workspace/panels.ts';
import { INITIAL_CAMERA, type CameraState } from './view/camera.ts';
import type { ColorPickerClosed, ColorPickerState } from './inspector/color-picker.ts';
import type { Preferences } from './preferences/preferences.ts';
import type { Selection } from '../core/document/model.ts';
import type { Revealed } from './inspector/sections.ts';
import type { EditMode } from './canvas/edit-mode.ts';

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
  // the page's horizontal place on the stage while it is wider than the stage (spec zoom-keyboard-buttons)
  readonly camera: CameraState;
  // the colour picker open on a property, and how its last session ended (inspector/color-picker.ts)
  readonly colorPicker: ColorPickerState | null;
  readonly colorPickerClosed: ColorPickerClosed;
  // the field the inspector was last asked to show (inspector.reveal); absent until one is
  readonly revealed?: Revealed | undefined;
  // the Edit on canvas mode (canvas/edit-mode.ts); absent while none is on
  readonly editMode?: EditMode | undefined;
  // the class the Style tab's writes go to (inspector/style-target.ts); absent while the target is the element
  readonly styleTarget?: string | undefined;
  // the dialog open (workspace/dialogs.ts): Guides & Grids, Snap settings; absent while none is
  readonly dialog?: 'guides-grids' | 'snap-settings' | 'recovery' | undefined;
  // the saved versions the recovery dialog offers, the newest first, with their times (spec
  // autosave-corruption-recovery); absent when the saved work was read
  readonly recovery?: readonly { readonly revision: number; readonly time: number }[] | undefined;
  // the style state the editor edits (view.setStyleState; view/style-state.ts); absent while it is Base
  readonly styleState?: string | undefined;
  // the preview (view/preview.ts): the selection to give back when it ends; absent while editing
  readonly preview?: { readonly selection: Selection } | undefined;
  // the command bar shown (commandBar.open; command-bar/command-bar.ts); absent while closed
  readonly commandBar?: true | undefined;
}

export function initialEditorUi(preferences: Preferences): EditorUi {
  return {
    panels: panelsFor(preferences.developerTools === true),
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
    camera: INITIAL_CAMERA,
    colorPicker: null,
    colorPickerClosed: { applied: false, count: 0 },
  };
}
