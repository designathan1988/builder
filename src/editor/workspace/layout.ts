// The workspace layout (ARCHITECTURE.md): the dock's state, collapsed to its strip, open, or maximised over the
// canvas area, and the active tab of each tab group: the dock's and the inspector's (workspace.setActiveTab; Page
// properties shows the inspector's Settings tab, page-properties.ts). Later:
// splitter sizes and floating panel positions. The first state is data: the workbench and the dock panels of
// layout.json that are open, and the inspector's first tab.
import { registerHandler } from '../../core/commands/registry.ts';
import { doorsIn, manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import type { Panel } from './panels.ts';

export const DOCK_STATES = ['collapsed', 'open', 'max'] as const;
export type DockState = (typeof DOCK_STATES)[number];

export interface LayoutState {
  readonly dock: DockState;
  // the dock tab whose body shows
  readonly activeDockTab: Panel | null;
  // the inspector tab chosen (DESIGN.md "Inspector": Style, Settings, Interactions); absent while the first one shows
  readonly inspectorTab?: string | undefined;
}

const firstOpen = (place: string): Panel | null =>
  (Object.entries(manifest.layout.panels).find(([, data]) => data.place === place && data.open)?.[0] as Panel | undefined) ?? null;

// The inspector's tabs: the tab doors its header draws, in their order there, each naming its group and its tab
// (manifest data: the arguments of their doors). The first is the tab shown at the start.
const INSPECTOR_TAB_DOORS = doorsIn('inspector-header').flatMap((d) => (d.door.kind === 'panel-control' && d.door.drawnAs === 'tab' ? [d.door.args] : []));
export const INSPECTOR_TABS: readonly string[] = INSPECTOR_TAB_DOORS.flatMap((args) => (typeof args.panel === 'string' ? [args.panel] : []));
const INSPECTOR_GROUP = INSPECTOR_TAB_DOORS[0]?.group;
const FIRST_TAB = INSPECTOR_TABS[0];
if (typeof INSPECTOR_GROUP !== 'string' || FIRST_TAB === undefined) throw new Error('the manifest draws no tab in the inspector header');
const FIRST_INSPECTOR_TAB: string = FIRST_TAB;
// the dock's tab strip names its group so (dock.tsx)
const WORKBENCH_GROUP = 'workbench';

export const INITIAL_LAYOUT: LayoutState = {
  dock: firstOpen('workbench') !== null ? 'open' : 'collapsed',
  activeDockTab: firstOpen('dock'),
};

// the inspector tab whose body shows
export function inspectorTab(ui: EditorUi): string {
  return ui.layout.inspectorTab ?? FIRST_INSPECTOR_TAB;
}

// The inspector tab that draws a region: each tab draws the region named after it, inspector-<tab> (DESIGN.md
// "Regions": inspector-style, inspector-settings, inspector-interactions); null when no tab draws it.
export function inspectorTabDrawing(region: string): string | null {
  return INSPECTOR_TABS.find((tab) => region === `inspector-${tab}`) ?? null;
}

// The editor state with an inspector tab shown: the same state when it shows already.
export function withInspectorTab(ui: EditorUi, panel: string): EditorUi {
  if (!INSPECTOR_TABS.includes(panel)) throw new Error(`the inspector has no tab ${panel}`);
  if (inspectorTab(ui) === panel) return ui;
  return { ...ui, layout: { ...ui.layout, inspectorTab: panel === FIRST_INSPECTOR_TAB ? undefined : panel } };
}

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

// workspace.setActiveTab (spec inspector-panel): shows a tab of its group. The inspector's tab stays chosen when the
// selection changes and records nothing; a dock tab shows its panel, and a collapsed dock opens to show it (as View's
// items show a dock panel, panels.ts). A door stands for the tab its group shows now.
export const setActiveTab = registerHandler<'workspace.setActiveTab', EditorUi>(
  'workspace.setActiveTab',
  ({ state }, { group, panel }) => {
    const ui = state.ui;
    if (group === INSPECTOR_GROUP) {
      // a door names a tab of the inspector's header; anything else is a defect of the door
      if (!INSPECTOR_TABS.includes(panel)) throw new Error(`workspace.setActiveTab: the inspector has no tab ${panel}`);
      if (inspectorTab(ui) === panel) return { kind: 'change' };
      return { kind: 'change', ui: withInspectorTab(ui, panel) };
    }
    if (group === WORKBENCH_GROUP) {
      const tab = panel as Panel;
      // the dock's strip draws a tab for each of its open panels only
      if (!ui.panels.dockTabs.includes(tab)) throw new Error(`workspace.setActiveTab: the dock has no tab ${panel}`);
      return { kind: 'change', ui: withDock(withActiveDockTab(ui, tab), ui.layout.dock === 'collapsed' ? 'open' : ui.layout.dock) };
    }
    throw new Error(`workspace.setActiveTab: no tab group ${group}`);
  },
  (state, args) => {
    if (args.group === INSPECTOR_GROUP) return inspectorTab(state.ui) === args.panel;
    if (args.group === WORKBENCH_GROUP) return state.ui.layout.dock !== 'collapsed' && state.ui.layout.activeDockTab === args.panel;
    return false;
  },
);

export const setWorkbenchState = registerHandler<'workspace.setWorkbenchState', EditorUi>(
  'workspace.setWorkbenchState',
  ({ state }, args) => ({
    kind: 'change',
    ui: withDock(state.ui, nextDock(state.ui.layout.dock, args.state)),
  }),
  // maximise says whether the workbench is maximised; the others whether it shows
  (state, args) => (args.state === 'toggle-max' ? state.ui.layout.dock === 'max' : state.ui.layout.dock !== 'collapsed'),
);
