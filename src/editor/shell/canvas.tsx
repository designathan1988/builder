// The centre column (DESIGN.md "Regions" and "Canvas"): the file tabs, the canvas toolbar with the Canvas / Split /
// Code switch, the rulers, and the frame with its breakpoint tabs along the cascade from the base breakpoint, and the
// page's iframe (src/editor/canvas/frame.tsx) at the camera's zoom (src/editor/view/camera.ts): the chosen one, or in
// Fit mode the one that fits the frame to the stage; the frame is placed at the camera's pan.
import { useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { CanvasFrame } from '../canvas/frame.tsx';
import { Rulers } from '../canvas/rulers.tsx';
import { DoorControl, Icon } from '../doors/door.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { doorSlots, partOf, slotsIn } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { FIT_MARGIN, fitZoom, panOf, registerStage } from '../view/camera.ts';
import { activeBreakpoint } from '../view/breakpoints.ts';
import { activeState } from '../view/style-state.ts';
import { panState } from '../input/pointer.ts';
import { isPanelOpen } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import { ReportFitZoom, Slots, useFitZoom } from './slots.tsx';
import { QuickPanel } from '../canvas/quick-panel.tsx';
import { AnchorTabs } from '../canvas/anchor-tabs.tsx';

const BREAKPOINTS = manifest.properties.breakpoints;
const PAGE_ICON = manifest.elements.elements.find((e) => e.tag === 'body')?.icon ?? null;

const drawnAs = (entry: DoorEntry): string | null => (entry.door.kind === 'toolbar' || entry.door.kind === 'panel-control' ? entry.door.drawnAs : null);

function FileTabs() {
  const page = useEditorState((s) => s.document.pages[0]);
  // the region's first item is the page's tab (DESIGN.md "Regions": 1 page tab), its close button drawn inside it
  const tab = doorSlots('file-tabs').find((d) => drawnAs(d) === 'item');
  const close = tab ? partOf('file-tabs', tab) : null;
  if (!page || !tab) return <div className="file-tabs" data-region="file-tabs" />;
  return (
    <div className="file-tabs" data-region="file-tabs" role="tablist">
      {/* the open page's tab is marked by its door's own current state (pages.switch), none before that command exists */}
      <div className="file-tab">
        <DoorControl entry={tab} args={{ page: page.id }} className="file-tab__main">
          {PAGE_ICON !== null ? <Icon name={PAGE_ICON} size="sm" /> : null}
          <span className="file-tab__name">{page.name}</span>
          <span className="file-tab__file">{page.file}</span>
        </DoorControl>
        {close ? <DoorControl entry={close} args={{ page: page.id }} /> : null}
      </div>
    </div>
  );
}

function ZoomValue() {
  const zoom = useFitZoom();
  const t = useT();
  return <span className="zoom-value">{t('view.zoomValue', { zoom: Math.round(zoom * 100) })}</span>;
}

function CanvasToolbar() {
  const toolsOpen = useEditorState((s) => isPanelOpen(s.ui, 'canvas-tools'));
  // the canvas tools, and the toolbar door that shows or hides them (the one that opens their panel)
  const tools = slotsIn('canvas-toolbar').filter((s) => s.kind === 'door' && s.entry.door.kind === 'panel-control' && s.entry.door.panel === 'canvas-tools').map((s) => s.order);
  const toggleOrder = slotsIn('canvas-toolbar').find((s) => s.kind === 'door' && s.entry.door.args.panel === 'canvas-tools')?.order ?? 0;
  return (
    <div className="canvas-toolbar" data-region="canvas-toolbar" data-key-context="toolbar">
      <div className="segmented" role="group">
        <Slots region="canvas-toolbar" render={(slot) => (slot.kind === 'door' && drawnAs(slot.entry) === 'segment' ? undefined : null)} />
      </div>
      <span className="separator" />
      <Slots
        region="canvas-toolbar"
        from={toggleOrder}
        render={(slot) => {
          if (slot.kind === 'door' && tools.includes(slot.order) && !toolsOpen) return null;
          if (slot.kind === 'menu' && slot.anchor.drawnAs === 'button') {
            return (
              <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor} indicator className="canvas-toolbar__zoom">
                <ZoomValue />
              </MenuButton>
            );
          }
          return undefined;
        }}
      />
    </div>
  );
}

function BreakpointTabs() {
  const t = useT();
  const byId = new Map(BREAKPOINTS.map((b) => [b.id, b]));
  return (
    <div className="frame-tabs" data-region="canvas-frame" role="tablist">
      <Slots
        region="canvas-frame"
        render={(slot) => {
          if (slot.kind !== 'door') return undefined;
          const breakpoint = byId.get(String(slot.entry.door.args.breakpoint));
          if (!breakpoint) return undefined;
          return (
            <DoorControl key={slot.entry.ref} entry={slot.entry} className="frame-tab">
              <span className="door__label">{t(breakpoint.labelKey as MessageId)}</span>
              <span className="frame-tab__width">{breakpoint.width}</span>
              {breakpoint.base ? (
                <span className="frame-tab__base" title={t('canvas.baseTip')}>
                  {t('canvas.base')}
                </span>
              ) : null}
            </DoorControl>
          );
        }}
      />
    </div>
  );
}

// While a state other than Base is edited (spec state-styles), a badge over the frame names it: "Editing Hover".
function StateBadge() {
  const t = useT();
  const state = useEditorState((s) => activeState(s.ui));
  if (state.pseudo === null) return null;
  return (
    <div className="canvas-state-badge" data-canvas-badge="state">
      {t('canvas.badge.editingState', { state: t(state.labelKey as MessageId) })}
    </div>
  );
}

export function CanvasColumn() {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // measured before the first paint, so the canvas never shows an unfitted frame (at zoom 1) before it fits: a layout
  // read right after the editor appears must see the fitted canvas; the observer then follows every later resize
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const first = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const width = first.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0);
    const height = first.height - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0);
    setSize({ width, height });
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // the camera's zoom: the chosen one, or the one that fits the base breakpoint's width with the fit margin on both
  // sides; the stage's width is reported to the camera, whose handlers pivot and fit on it
  const chosen = useEditorState((s) => s.ui.preferences.zoom);
  // the page's width: the active breakpoint's (view/breakpoints.ts)
  const pageWidth = useEditorState((s) => activeBreakpoint(s.ui).width);
  const zoom = chosen !== undefined ? chosen / 100 : fitZoom(size.width, pageWidth);
  const pan = useEditorState((s) => panOf(s.ui, zoom, size.width));
  useLayoutEffect(() => registerStage(stage.current), []);
  const report = useContext(ReportFitZoom);
  useLayoutEffect(() => report(zoom), [report, zoom]);
  // Space held over the stage, or a pan in progress: the grab cursor (spec zoom-wheel-pan)
  const panning = useSyncExternalStore(panState.subscribe, panState.get);
  const rulersHidden = useEditorState((s) => s.ui.preferences.rulersHidden === true);
  return (
    <>
      <main className="centre" data-key-context="canvas">
        <FileTabs />
        <CanvasToolbar />
        <div className={`stage-wrap${rulersHidden ? ' stage-wrap--no-rulers' : ''}`}>
          <Rulers />
          {/* the stage around the page: a press here is on no node (pointer.ts) */}
          <div className={`stage${panning !== 'idle' ? ` stage--${panning}` : ''}`} ref={stage} data-canvas-stage>
            <div className="frame" style={{ width: pageWidth * zoom, left: FIT_MARGIN + pan }}>
              <BreakpointTabs />
              <StateBadge />
              <CanvasFrame width={pageWidth} zoom={zoom} />
            </div>
            {/* the quick panel of the selection, over the stage (canvas/quick-panel.tsx) */}
            <QuickPanel stage={stage} />
            {/* the anchor tabs of a positioned selection (canvas/anchor-tabs.tsx) */}
            <AnchorTabs stage={stage} />
          </div>
        </div>
      </main>
    </>
  );
}

export { ZoomValue };
