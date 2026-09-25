// The workspace layout (ARCHITECTURE.md): the dock's state, collapsed to its strip, open, or maximised over the
// canvas area, and the dock's active tab. Later: the active tab of the other tab groups, splitter sizes and floating
// panel positions. The first state is data: the workbench and the dock panels of layout.json that are open.
import { registerHandler } from '../../core/commands/registry.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import type { Panel } from './panels.ts';

export const DOCK_STATES = ['collapsed', 'open', 'max'] as const;
export type DockState = (typeof DOCK_STATES)[number];

export interface LayoutState {
  readonly dock: DockState;
  // the dock tab whose body shows
  readonly activeDockTab: Panel | null;
}

const firstOpen = (place: string): Panel | null =>
  (Object.entries(manifest.layout.panels).find(([, data]) => data.place === place && data.open)?.[0] as Panel | undefined) ?? null;

export const INITIAL_LAYOUT: LayoutState = {
  dock: firstOpen('workbench') !== null ? 'open' : 'collapsed',
  activeDockTab: firstOpen('dock'),
};

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

export function withActiveDockTab(ui: EditorUi, tab: Panel | null): EditorUi {
  return ui.layout.activeDockTab === tab ? ui : { ...ui, layout: { ...ui.layout, activeDockTab: tab } };
}

export const setWorkbenchState = registerHandler<'workspace.setWorkbenchState', EditorUi>(
  'workspace.setWorkbenchState',
  ({ state }, args) => ({
    kind: 'change',
    ui: withDock(state.ui, nextDock(state.ui.layout.dock, args.state)),
  }),
  // maximise says whether the workbench is maximised; the others whether it shows
  (state, args) => (args.state === 'toggle-max' ? state.ui.layout.dock === 'max' : state.ui.layout.dock !== 'collapsed'),
);
