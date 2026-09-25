// The drag session (ARCHITECTURE.md, Command owners): the keys of a drag in progress. drag.cancel (Escape in the drag
// key context) ends the pointer gesture that is open without committing it, so nothing it proposed or changed stays
// (spec drag-level-keys-escape, palette-drag-insert): the handler records the cancellation in the editor state and
// says so in the status bar; the pointer owner (pointer.ts), which holds the gesture, cancels it when a cancellation
// newer than the gesture's opening arrives, and the release that follows drops nothing. drag.levelUp and
// drag.levelDown are planned.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export interface DragSessionState {
  // how many times a drag has been cancelled
  readonly cancels: number;
}

export const INITIAL_DRAG_SESSION: DragSessionState = { cancels: 0 };

export const cancelDrag = registerHandler<'drag.cancel', EditorUi>('drag.cancel', ({ state }) => ({
  kind: 'change',
  ui: { ...state.ui, drag: { cancels: state.ui.drag.cancels + 1 } },
  message: message('status.drag.cancelled'),
}));
