// Panel visibility (ARCHITECTURE.md): which sidebar view is shown, and whether the sidebar, each section of a view,
// the inspector, the canvas tools and each dock tab are open. The commands workspace.setPanelOpen, toggleLeftDock,
// toggleInspector and collapseDocks change it; the status bar reports each change (spec dock-toggles, Problems 1).
// What a panel is (its name, its place, whether it is open at the first start) is data: `panels` of layout.json.
import type { CommandArgs } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, type Message } from '../../core/commands/registry.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { withActiveDockTab, withDock, type DockState } from './layout.ts';

export type Panel = CommandArgs['workspace.setPanelOpen']['panel'];
export type PanelData = (typeof manifest.layout.panels)[string];
export type PanelPlace = PanelData['place'];

// manifest:check rule panel proves layout.json declares every panel of workspace.setPanelOpen, and only those
export const PANELS = manifest.layout.panels as Readonly<Record<Panel, PanelData>>;

// A door's arguments open a panel without its content: they name a panel the shell draws no body for (drawsBody, from
// the tables the shell draws its bodies from: src/editor/shell/bodies.ts) and do not close it. Such a door is drawn
// disabled with "not available yet" (CLAUDE.md), as a door of a command that is not built.
export function opensEmptyPanel(args: Readonly<Record<string, unknown>>, drawsBody: (panel: Panel) => boolean): boolean {
  return typeof args.panel === 'string' && args.panel in PANELS && args.open !== 'close' && !drawsBody(args.panel as Panel);
}

// a panel's name in the catalogue
export const panelName = (panel: Panel): MessageId => PANELS[panel].labelKey as MessageId;

// the panels that live in a place, in the order of layout.json
export function panelsAt(place: PanelPlace): readonly Panel[] {
  return (Object.keys(PANELS) as Panel[]).filter((panel) => PANELS[panel].place === place);
}

export interface PanelsState {
  // the sidebar column (Ctrl+B) and the view it shows
  readonly sidebar: boolean;
  readonly sidebarView: Panel;
  // whether each section, the inspector and the canvas tools are open
  readonly open: Readonly<Record<Panel, boolean>>;
  // the dock's tabs, in the order they were opened
  readonly dockTabs: readonly Panel[];
  // what the first Ctrl+\ collapsed, put back by the second
  readonly collapsed: { readonly sidebar: boolean; readonly inspector: boolean; readonly dock: DockState } | null;
}

const sidebarViews = panelsAt('sidebar');
const firstView = sidebarViews.find((panel) => PANELS[panel].open) ?? sidebarViews[0];
if (firstView === undefined) throw new Error('layout.json declares no sidebar view');

export const INITIAL_PANELS: PanelsState = {
  sidebar: sidebarViews.some((panel) => PANELS[panel].open),
  sidebarView: firstView,
  open: Object.fromEntries((Object.keys(PANELS) as Panel[]).map((panel) => [panel, PANELS[panel].open])) as Record<Panel, boolean>,
  dockTabs: panelsAt('dock').filter((panel) => PANELS[panel].open),
  collapsed: null,
};

export function isPanelOpen(ui: EditorUi, panel: Panel): boolean {
  const p = ui.panels;
  const data = PANELS[panel];
  switch (data.place) {
    case 'sidebar':
      return p.sidebar && p.sidebarView === panel;
    case 'section':
      return p.sidebar && p.sidebarView === data.in && p.open[panel];
    // a dock panel is open when it shows: its tab is the active one of a dock that is not folded, so a View item
    // that toggles it shows it first (the user's decision) and takes the tab out only while it shows
    case 'dock':
      return p.dockTabs.includes(panel) && ui.layout.dock !== 'collapsed' && ui.layout.activeDockTab === panel;
    case 'workbench':
      return ui.layout.dock !== 'collapsed';
    default:
      return p.open[panel];
  }
}

function withPanel(ui: EditorUi, panel: Panel, open: boolean): EditorUi {
  const p = ui.panels;
  const data = PANELS[panel];
  switch (data.place) {
    case 'sidebar':
      return { ...ui, panels: open ? { ...p, sidebar: true, sidebarView: panel } : { ...p, sidebar: p.sidebarView === panel ? false : p.sidebar } };
    case 'section': {
      const view = open && data.in !== null ? { sidebar: true, sidebarView: data.in as Panel } : {};
      return { ...ui, panels: { ...p, ...view, open: { ...p.open, [panel]: open } } };
    }
    case 'workbench':
      return withDock(ui, open ? 'open' : 'collapsed');
    case 'dock': {
      if (open) {
        const dockTabs = p.dockTabs.includes(panel) ? p.dockTabs : [...p.dockTabs, panel];
        return withDock(withActiveDockTab({ ...ui, panels: { ...p, dockTabs } }, panel), ui.layout.dock === 'collapsed' ? 'open' : ui.layout.dock);
      }
      // closing the last tab collapses the workbench (spec workbench-panel, Problems 1)
      const dockTabs = p.dockTabs.filter((t) => t !== panel);
      const active = ui.layout.activeDockTab === panel ? (dockTabs[dockTabs.length - 1] ?? null) : ui.layout.activeDockTab;
      const next = withActiveDockTab({ ...ui, panels: { ...p, dockTabs } }, active);
      return dockTabs.length === 0 ? withDock(next, 'collapsed') : next;
    }
    default:
      return { ...ui, panels: { ...p, open: { ...p.open, [panel]: open } } };
  }
}

const panelMessage = (panel: Panel, open: boolean): Message => message(open ? 'status.panel.opened' : 'status.panel.closed', { panel: { key: panelName(panel) } });

export const setPanelOpen = registerHandler<'workspace.setPanelOpen', EditorUi>('workspace.setPanelOpen', ({ state }, args) => {
  const open = args.open === 'toggle' ? !isPanelOpen(state.ui, args.panel) : args.open === 'open';
  const ui = withPanel(state.ui, args.panel, open);
  return { kind: 'change', ui, message: panelMessage(args.panel, open) };
});

export const toggleLeftDock = registerHandler<'workspace.toggleLeftDock', EditorUi>('workspace.toggleLeftDock', ({ state }) => {
  const sidebar = !state.ui.panels.sidebar;
  return { kind: 'change', ui: { ...state.ui, panels: { ...state.ui.panels, sidebar } }, message: message(sidebar ? 'status.sidebar.shown' : 'status.sidebar.hidden') };
});

// the inspector column: the panels placed there (layout.json names one, the inspector)
const withInspector = (ui: EditorUi, open: boolean): EditorUi => panelsAt('inspector').reduce((next, panel) => withPanel(next, panel, open), ui);
const inspectorOpen = (ui: EditorUi): boolean => panelsAt('inspector').some((panel) => isPanelOpen(ui, panel));

export const toggleInspector = registerHandler<'workspace.toggleInspector', EditorUi>('workspace.toggleInspector', ({ state }) => {
  const open = !inspectorOpen(state.ui);
  return { kind: 'change', ui: withInspector(state.ui, open), message: message(open ? 'status.inspector.shown' : 'status.inspector.hidden') };
});

// Ctrl+\: collapses every dock; the second press puts back exactly what was open (spec dock-toggles).
export const collapseDocks = registerHandler<'workspace.collapseDocks', EditorUi>('workspace.collapseDocks', ({ state }) => {
  const { ui } = state;
  const p = ui.panels;
  const inspector = inspectorOpen(ui);
  const anyOpen = p.sidebar || inspector || ui.layout.dock !== 'collapsed';
  if (!anyOpen && p.collapsed !== null) {
    const back = p.collapsed;
    const restored = withInspector({ ...ui, panels: { ...p, sidebar: back.sidebar, collapsed: null } }, back.inspector);
    return { kind: 'change', ui: withDock(restored, back.dock), message: message('status.docks.restored') };
  }
  const collapsed = { sidebar: p.sidebar, inspector, dock: ui.layout.dock };
  const hidden = withInspector({ ...ui, panels: { ...p, sidebar: false, collapsed } }, false);
  return { kind: 'change', ui: withDock(hidden, 'collapsed'), message: message('status.docks.collapsed') };
});
