// The centre column (DESIGN.md "Regions" and "Canvas"): the file tabs, the canvas toolbar with the Canvas / Split /
// Code switch, the rulers, and the frame with its breakpoint tabs along the cascade from the base breakpoint. The
// frame is empty here: the page's iframe arrives with the canvas (foundation part 2).
import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon } from '../doors/door.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { doorSlots, slotsIn } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { isPanelOpen } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import { ReportFitZoom, Slots, useFitZoom } from './slots.tsx';

const BREAKPOINTS = manifest.properties.breakpoints;
const BASE = BREAKPOINTS.find((b) => b.base) ?? BREAKPOINTS[0];
const PAGE_ICON = manifest.elements.elements.find((e) => e.tag === 'body')?.icon ?? null;
// the frame's distance from the left ruler (DESIGN.md "Canvas"), read from its token
const FRAME_GAP_TOKEN = '--space-9';
// ruler numbers every 200 page pixels (design/final)
const RULER_STEP = 200;

const drawnAs = (entry: DoorEntry): string | null => (entry.door.kind === 'toolbar' || entry.door.kind === 'panel-control' ? entry.door.drawnAs : null);

function FileTabs() {
  const page = useEditorState((s) => s.document.pages[0]);
  const tab = doorSlots('file-tabs').find((d) => d.command.id === 'pages.switch');
  const close = doorSlots('file-tabs').find((d) => drawnAs(d) === 'icon-button');
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
  const toggleOrder = slotsIn('canvas-toolbar').find((s) => s.kind === 'door' && s.entry.command.id === 'workspace.setPanelOpen')?.order ?? 0;
  const tools = slotsIn('canvas-toolbar').filter((s) => s.kind === 'door' && s.entry.door.kind === 'panel-control' && s.entry.door.panel === 'canvas-tools').map((s) => s.order);
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

function Rulers({ width, gap }: { readonly width: number; readonly gap: number }) {
  const zoom = useFitZoom();
  const marks: number[] = [];
  for (let at = 0; at <= (BASE?.width ?? 0); at += RULER_STEP) marks.push(at);
  return (
    <>
      <div className="ruler ruler--corner" />
      <div className="ruler ruler--x" style={{ '--zoom': zoom } as CSSProperties}>
        {marks.map((m) => (
          <span key={m} className="ruler__mark" style={{ left: gap + m * zoom }}>
            {m}
          </span>
        ))}
      </div>
      <div className="ruler ruler--y" style={{ '--zoom': zoom } as CSSProperties}>
        {marks.filter((m) => m * zoom < width).map((m) => (
          <span key={m} className="ruler__mark" style={{ top: m * zoom }}>
            {m}
          </span>
        ))}
      </div>
    </>
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

export function CanvasColumn() {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, gap: 0 });
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const gap = parseFloat(getComputedStyle(element).getPropertyValue(FRAME_GAP_TOKEN)) || 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height, gap });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // the zoom that fits the base breakpoint's width, with the frame's gap on both sides
  const zoom = size.width > 0 && BASE ? Math.max(0.1, (size.width - 2 * size.gap) / BASE.width) : 1;
  const report = useContext(ReportFitZoom);
  useEffect(() => report(zoom), [report, zoom]);
  return (
    <>
      <main className="centre" data-key-context="canvas">
        <FileTabs />
        <CanvasToolbar />
        <div className="stage-wrap">
          <Rulers width={size.height} gap={size.gap} />
          <div className="stage" ref={stage}>
            <div className="frame" style={{ width: (BASE?.width ?? 0) * zoom }}>
              <BreakpointTabs />
              <div className="frame__view" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export { ZoomValue };
