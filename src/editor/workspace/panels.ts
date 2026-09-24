// Panel visibility (ARCHITECTURE.md): which sidebar view is shown, and whether the sidebar, the Layers section, the
// inspector, the canvas tools and each dock tab are open. The commands workspace.setPanelOpen, toggleLeftDock,
// toggleInspector and collapseDocks change it; the status bar reports each change (spec dock-toggles, Problems 1).
import type { CommandArgs } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, type Message } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';
import { withDock, type DockState } from './layout.ts';

export type Panel = CommandArgs['workspace.setPanelOpen']['panel'];

// the sidebar's views (the activity bar) and the dock's tabs, as panels of workspace.setPanelOpen
export const SIDEBAR_VIEWS = ['explorer', 'elements', 'variables'] as const satisfies readonly Panel[];
export type SidebarView = (typeof SIDEBAR_VIEWS)[number];
export const DOCK_TABS = ['timeline', 'checks', 'shortcuts', 'document'] as const satisfies readonly Panel[];
export type DockTab = (typeof DOCK_TABS)[number];

export interface PanelsState {
  readonly sidebarView: SidebarView;
  readonly sidebar: boolean;
  readonly inspector: boolean;
  // the Layers section of the Explorer
  readonly layers: boolean;
  // canvas toolbar items 5–9 (outlines, zones, grids)
  readonly canvasTools: boolean;
  readonly dockTabs: readonly DockTab[];
  readonly activeDockTab: DockTab | null;
  // what the first Ctrl+\ collapsed, put back by the second
  readonly collapsed: { readonly sidebar: boolean; readonly inspector: boolean; readonly dock: DockState } | null;
}

// DESIGN.md: the Explorer is the default sidebar view; Timeline and Checks are the dock's tabs.
export const INITIAL_PANELS: PanelsState = {
  sidebarView: 'explorer',
  sidebar: true,
  inspector: true,
  layers: true,
  canvasTools: true,
  dockTabs: ['timeline', 'checks'],
  activeDockTab: 'timeline',
  collapsed: null,
};

// each panel's name in the catalogue
export const PANEL_LABELS: Readonly<Record<Panel, MessageId>> = {
  elements: 'panel.elements',
  layers: 'panel.layers',
  inspector: 'panel.inspector',
  explorer: 'panel.explorer',
  timeline: 'panel.timeline',
  variables: 'panel.variables',
  checks: 'panel.checks',
  workbench: 'panel.workbench',
  shortcuts: 'panel.shortcuts',
  document: 'panel.document',
  'canvas-tools': 'panel.canvasTools',
};

const isSidebarView = (panel: Panel): panel is SidebarView => (SIDEBAR_VIEWS as readonly Panel[]).includes(panel);
const isDockTab = (panel: Panel): panel is DockTab => (DOCK_TABS as readonly Panel[]).includes(panel);

export function isPanelOpen(ui: EditorUi, panel: Panel): boolean {
  const p = ui.panels;
  if (isSidebarView(panel)) return p.sidebar && p.sidebarView === panel;
  if (isDockTab(panel)) return p.dockTabs.includes(panel);
  if (panel === 'layers') return p.sidebar && p.sidebarView === 'explorer' && p.layers;
  if (panel === 'inspector') return p.inspector;
  if (panel === 'workbench') return ui.layout.dock !== 'collapsed';
  return p.canvasTools;
}

function withPanel(ui: EditorUi, panel: Panel, open: boolean): EditorUi {
  const p = ui.panels;
  if (isSidebarView(panel)) return { ...ui, panels: open ? { ...p, sidebar: true, sidebarView: panel } : { ...p, sidebar: p.sidebarView === panel ? false : p.sidebar } };
  if (panel === 'layers') return { ...ui, panels: open ? { ...p, sidebar: true, sidebarView: 'explorer', layers: true } : { ...p, layers: false } };
  if (panel === 'inspector') return { ...ui, panels: { ...p, inspector: open } };
  if (panel === 'canvas-tools') return { ...ui, panels: { ...p, canvasTools: open } };
  if (panel === 'workbench') return withDock(ui, open ? 'open' : 'collapsed');
  if (open) {
    const dockTabs = p.dockTabs.includes(panel) ? p.dockTabs : [...p.dockTabs, panel];
    return withDock({ ...ui, panels: { ...p, dockTabs, activeDockTab: panel } }, ui.layout.dock === 'collapsed' ? 'open' : ui.layout.dock);
  }
  // closing the last tab collapses the workbench (spec workbench-panel, Problems 1)
  const dockTabs = p.dockTabs.filter((t) => t !== panel);
  const activeDockTab = p.activeDockTab === panel ? (dockTabs[dockTabs.length - 1] ?? null) : p.activeDockTab;
  const next: EditorUi = { ...ui, panels: { ...p, dockTabs, activeDockTab } };
  return dockTabs.length === 0 ? withDock(next, 'collapsed') : next;
}

const panelMessage = (panel: Panel, open: boolean): Message => message(open ? 'status.panel.opened' : 'status.panel.closed', { panel: { key: PANEL_LABELS[panel] } });

export const setPanelOpen = registerHandler<'workspace.setPanelOpen', EditorUi>('workspace.setPanelOpen', ({ state }, args) => {
  const open = args.open === 'toggle' ? !isPanelOpen(state.ui, args.panel) : args.open === 'open';
  const ui = withPanel(state.ui, args.panel, open);
  return { kind: 'change', ui, message: panelMessage(args.panel, open) };
});

export const toggleLeftDock = registerHandler<'workspace.toggleLeftDock', EditorUi>('workspace.toggleLeftDock', ({ state }) => {
  const sidebar = !state.ui.panels.sidebar;
  return { kind: 'change', ui: { ...state.ui, panels: { ...state.ui.panels, sidebar } }, message: message(sidebar ? 'status.sidebar.shown' : 'status.sidebar.hidden') };
});

export const toggleInspector = registerHandler<'workspace.toggleInspector', EditorUi>('workspace.toggleInspector', ({ state }) => {
  const inspector = !state.ui.panels.inspector;
  return { kind: 'change', ui: { ...state.ui, panels: { ...state.ui.panels, inspector } }, message: message(inspector ? 'status.inspector.shown' : 'status.inspector.hidden') };
});

// Ctrl+\: collapses every dock; the second press puts back exactly what was open (spec dock-toggles).
export const collapseDocks = registerHandler<'workspace.collapseDocks', EditorUi>('workspace.collapseDocks', ({ state }) => {
  const { ui } = state;
  const p = ui.panels;
  const anyOpen = p.sidebar || p.inspector || ui.layout.dock !== 'collapsed';
  if (!anyOpen && p.collapsed !== null) {
    const back = p.collapsed;
    return { kind: 'change', ui: withDock({ ...ui, panels: { ...p, sidebar: back.sidebar, inspector: back.inspector, collapsed: null } }, back.dock), message: message('status.docks.restored') };
  }
  const collapsed = { sidebar: p.sidebar, inspector: p.inspector, dock: ui.layout.dock };
  return { kind: 'change', ui: withDock({ ...ui, panels: { ...p, sidebar: false, inspector: false, collapsed } }, 'collapsed'), message: message('status.docks.collapsed') };
});
