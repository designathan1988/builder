// Panel bodies (ARCHITECTURE.md): whether a panel has its content. A panel has it when the shell draws a body for it,
// and the answer is read from the tables the shell draws its bodies from, never from a status written by hand: a
// sidebar view has a body when SIDEBAR_VIEWS (sidebar.tsx) has one, a dock tab when DOCK_TABS (dock.tsx) has one, a
// section when the view it is in has one; the panels of the shell's own frame (the inspector column, the canvas tools,
// the workbench) are drawn by the shell itself. shell.tsx hands the answer to every door through PanelBodies, so the
// doors never import the views, which draw doors.
import { createContext, type ComponentType } from 'react';
import { PANELS, type Panel } from '../workspace/panels.ts';

export type BodyTable = Readonly<Partial<Record<Panel, ComponentType>>>;

export function bodiesDrawn(views: BodyTable, tabs: BodyTable): (panel: Panel) => boolean {
  const drawn = (panel: Panel): boolean => {
    const data = PANELS[panel];
    switch (data.place) {
      case 'sidebar':
        return views[panel] !== undefined;
      case 'dock':
        return tabs[panel] !== undefined;
      case 'section':
        return data.in !== null && drawn(data.in as Panel);
      case 'inspector':
      case 'canvas-toolbar':
      case 'workbench':
        return true;
    }
  };
  return drawn;
}

// outside the shell no body is drawn, so no door opens a panel there
export const PanelBodies = createContext<(panel: Panel) => boolean>(() => false);
