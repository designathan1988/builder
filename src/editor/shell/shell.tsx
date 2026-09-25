// The shell regions (ARCHITECTURE.md): the window grid of DESIGN.md "The window", with the top bar, the activity
// bar and the sidebar, the centre column, the inspector, the dock and the status bar. The sidebar, the inspector and
// the dock are shown or hidden by the workspace state; the theme and the language follow the preferences.
import { useEffect, useState } from 'react';
import { ContextMenu } from '../doors/menu.tsx';
import { installKeymap } from '../input/keymap.ts';
import { installPointer } from '../input/pointer.ts';
import { installFocus } from '../focus/focus.ts';
import { useEditorState, useStore } from '../store.ts';
import { isPanelOpen } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import { PanelBodies, bodiesDrawn } from './bodies.ts';
import { CanvasColumn } from './canvas.tsx';
import { DOCK_TABS, Dock } from './dock.tsx';
import { Inspector } from './inspector.tsx';
import { ActivityBar, SIDEBAR_VIEWS, Sidebar } from './sidebar.tsx';
import { StatusBar } from './status-bar.tsx';
import { Toast } from './toast.tsx';
import { TopBar } from './top-bar.tsx';
import { FitZoom, ReportFitZoom } from './slots.tsx';

// which panels the shell draws a body for, from the tables it draws them from (bodies.ts)
const drawsBody = bodiesDrawn(SIDEBAR_VIEWS, DOCK_TABS);

function usePreferencesOnDocument(): void {
  const theme = useEditorState((s) => s.ui.preferences.theme);
  const locale = useEditorState((s) => s.ui.preferences.locale);
  useEffect(() => {
    // "system" follows prefers-color-scheme (tokens.css); light and dark are forced with data-theme
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}

export function Shell() {
  const store = useStore();
  const t = useT();
  const sidebar = useEditorState((s) => s.ui.panels.sidebar);
  const inspector = useEditorState((s) => isPanelOpen(s.ui, 'inspector'));
  const dock = useEditorState((s) => s.ui.layout.dock);
  // a measure of the layout (the zoom that fits the frame), not editor state: the camera arrives with the canvas
  const [zoom, setZoom] = useState(1);
  usePreferencesOnDocument();
  useEffect(() => installKeymap(store), [store]);
  useEffect(() => installPointer(store), [store]);
  useEffect(() => installFocus(store), [store]);
  const classes = ['shell', sidebar ? '' : 'shell--no-sidebar', inspector ? '' : 'shell--no-inspector', `shell--dock-${dock}`].filter((c) => c !== '').join(' ');
  return (
    <PanelBodies.Provider value={drawsBody}>
      <FitZoom.Provider value={zoom}>
        <ReportFitZoom.Provider value={setZoom}>
          <div className={classes} aria-label={t('editor.label')} data-key-context="global">
            <TopBar />
            <ActivityBar />
            {sidebar ? <Sidebar /> : null}
            <div className="workbench">
              <CanvasColumn />
              <Dock />
            </div>
            <Inspector />
            <StatusBar />
            <Toast />
            <ContextMenu />
          </div>
        </ReportFitZoom.Provider>
      </FitZoom.Provider>
    </PanelBodies.Provider>
  );
}
