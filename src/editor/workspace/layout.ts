// The workspace layout (ARCHITECTURE.md): the dock's state, collapsed to its strip, open, or maximised over the
// canvas area. Later: the active tab of each tab group, splitter sizes and floating panel positions.
import { registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export const DOCK_STATES = ['collapsed', 'open', 'max'] as const;
export type DockState = (typeof DOCK_STATES)[number];

export interface LayoutState {
  readonly dock: DockState;
}

// The dock is collapsed to its strip by default (DESIGN.md "Dock and status bar").
export const INITIAL_LAYOUT: LayoutState = { dock: 'collapsed' };

export type WorkbenchRequest = 'collapsed' | 'open' | 'max' | 'toggle' | 'toggle-max';

// toggle shows or hides the workbench; toggle-max maximises it, or restores it to open
export function nextDock(current: DockState, request: WorkbenchRequest): DockState {
  if (request === 'toggle') return current === 'collapsed' ? 'open' : 'collapsed';
  if (request === 'toggle-max') return current === 'max' ? 'open' : 'max';
  return request;
}

export function withDock(ui: EditorUi, dock: DockState): EditorUi {
  return ui.layout.dock === dock ? ui : { ...ui, layout: { ...ui.layout, dock } };
}

export const setWorkbenchState = registerHandler<'workspace.setWorkbenchState', EditorUi>('workspace.setWorkbenchState', ({ state }, args) => ({
  kind: 'change',
  ui: withDock(state.ui, nextDock(state.ui.layout.dock, args.state)),
}));
