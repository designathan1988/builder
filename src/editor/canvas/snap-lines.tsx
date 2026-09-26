// The snap lines (spec snap-while-moving, Problems in Pager 4; spec smart-guides): while a free drag or a resize snaps,
// or aligns with smart guides on (canvas/snapping.ts), each axis draws a dashed line at the place it snapped to or
// aligns with, from the moving element to the target, and an element target (a sibling, the parent, the page) is
// outlined, so the person sees why; each equal gap is marked on both gaps with its value (Problems in Pager 2).
// Drawn over the page (the overlay), in the canvas chrome, never in the page.
import { useLayoutEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { SnapLine } from '../../core/geometry/snap.ts';
import { canvasFrame, geometryOf, pageLayout, pageToScreen } from './coordinates.ts';
import { snapShown, type Snapped } from './snapping.ts';

interface Drawn {
  readonly lines: readonly { readonly axis: string; readonly source: string; readonly style: CSSProperties }[];
  readonly targets: readonly { readonly id: string; readonly style: CSSProperties }[];
  // the equal gaps: each marked from its start to its end, with its value
  readonly gaps: readonly { readonly axis: string; readonly value: number; readonly style: CSSProperties }[];
}

// a line's extent along the other axis: the moving box's and the target's together
function extent(line: SnapLine, snapped: Snapped): { readonly from: number; readonly to: number } {
  const [from, to] = line.axis === 'x' ? [snapped.box.y, snapped.box.y + snapped.box.height] : [snapped.box.x, snapped.box.x + snapped.box.width];
  return line.span === null ? { from, to } : { from: Math.min(from, line.span.from), to: Math.max(to, line.span.to) };
}

export function SnapLines({ overlay }: { readonly overlay: { readonly current: HTMLDivElement | null } }) {
  const snapped = useSyncExternalStore(snapShown.subscribe, snapShown.get);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  useLayoutEffect(() => {
    const request = requestAnimationFrame(() => setDrawn(measure(snapped, overlay.current)));
    return () => cancelAnimationFrame(request);
  }, [snapped, overlay]);
  if (drawn === null) return null;
  return (
    <>
      {drawn.targets.map((target) => (
        <div key={target.id} className="snap-target" data-snap-target={target.id} style={target.style} />
      ))}
      {drawn.gaps.map((gap, i) => (
        <div key={`gap-${i}`} className={`equal-gap equal-gap--${gap.axis}`} data-equal-gap={gap.value} style={gap.style}>
          <span className="equal-gap__value">{gap.value}</span>
        </div>
      ))}
      {drawn.lines.map((line) => (
        <div key={line.axis} className={`snap-line snap-line--${line.axis}`} data-snap-line={line.axis} data-snap-source={line.source} style={line.style} />
      ))}
    </>
  );
}

// where the lines and the outlined targets are drawn on the overlay, from the frame's geometry now
function measure(snapped: Snapped | null, overlay: HTMLDivElement | null): Drawn | null {
  const frame = canvasFrame();
  const g = frame ? geometryOf(frame) : null;
  const area = overlay?.getBoundingClientRect();
  if (snapped === null || g === null || area === undefined) return null;
  // a page point on the overlay
  const at = (x: number, y: number) => {
    const screen = pageToScreen({ x, y }, g);
    return { x: screen.x - area.x, y: screen.y - area.y };
  };
  const lines = [snapped.x, snapped.y].flatMap((snap) => {
    if (snap === null) return [];
    const { from, to } = extent(snap.line, snapped);
    const start = snap.line.axis === 'x' ? at(snap.line.at, from) : at(from, snap.line.at);
    const end = snap.line.axis === 'x' ? at(snap.line.at, to) : at(to, snap.line.at);
    const style: CSSProperties = snap.line.axis === 'x' ? { left: start.x, top: start.y, height: end.y - start.y } : { left: start.x, top: start.y, width: end.x - start.x };
    return [{ axis: snap.line.axis, source: snap.line.source, style }];
  });
  const targets = [snapped.x, snapped.y].flatMap((snap) => {
    const target = snap?.line.target ?? null;
    const box = target !== null && snap !== null && (snap.line.source === 'element' || snap.line.source === 'parent' || snap.line.source === 'page') ? pageLayout.box(target) : null;
    if (target === null || box === null) return [];
    const topLeft = at(box.x, box.y);
    return [{ id: target, style: { left: topLeft.x, top: topLeft.y, width: box.width * g.zoom, height: box.height * g.zoom } }];
  });
  const gaps = snapped.gaps.flatMap((g) =>
    g.marks.map((mark) => {
      const start = g.axis === 'x' ? at(mark.from, mark.across) : at(mark.across, mark.from);
      const end = g.axis === 'x' ? at(mark.to, mark.across) : at(mark.across, mark.to);
      const style: CSSProperties = g.axis === 'x' ? { left: start.x, top: start.y, width: end.x - start.x } : { left: start.x, top: start.y, height: end.y - start.y };
      return { axis: g.axis, value: Math.round(g.gap), style };
    }),
  );
  return { lines, targets: targets.filter((t, i) => targets.findIndex((o) => o.id === t.id) === i), gaps };
}
