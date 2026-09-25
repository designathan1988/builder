// The canvas chrome (ARCHITECTURE.md): what the editor draws over the page, on the canvas overlay: the outline of
// every selected node and the primary's label (its name and its exported tag, so the page root reads "body"); with
// several selected, the dashed outline of their union and one label counting them ("3 elements selected"); the
// thinner outline of the node the pointer hovers (pointer.ts); and the band of a marquee while pointer.ts draws one
// (spec marquee-select: a 1 px accent border, a 16 % accent fill). Where a node is on the screen comes from the
// coordinates module (nodeBox), measured on every animation frame while there is something to draw, so the chrome
// follows scrolling, zoom and layout; the page itself is never touched (only the renderer writes it). The chrome
// takes no pointer event.
//
// Label rule (DESIGN.md "Canvas"): a label never covers page content. It sits above its element when that space is
// free, otherwise inside the element's top-left corner when that corner is free, otherwise below the element.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { locate } from '../../core/document/model.ts';
import { band, hover } from '../input/pointer.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { canvasFrame, contentBoxes, nodeBox } from './coordinates.ts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type Placement = 'above' | 'inside' | 'below';
interface Layout {
  readonly selected: readonly Box[];
  // the box around every selected node, drawn dashed while several are selected (DESIGN.md "Canvas", multi)
  readonly union: Box | null;
  readonly hovered: Box | null;
  readonly label: { readonly box: Box; readonly placement: Placement } | null;
  // the marquee's band while one is drawn (pointer.ts)
  readonly band: Box | null;
}
const EMPTY: Layout = { selected: [], union: null, hovered: null, label: null, band: null };

// the smallest box around every box given; null for none
export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const within = (a: Box, area: Box) => a.x >= area.x && a.y >= area.y && a.x + a.width <= area.x + area.width && a.y + a.height <= area.y + area.height;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Where the label of a box goes: the first free place in the rule's order, all in screen pixels; a place is free
// when it lies on the canvas and covers no page content. With none free it goes below.
export function placeLabel(box: Box, size: { readonly width: number; readonly height: number }, gap: number, content: readonly Box[], canvas: Box): { box: Box; placement: Placement } {
  const places: { box: Box; placement: Placement }[] = [
    { placement: 'above', box: { x: box.x, y: box.y - gap - size.height, ...size } },
    { placement: 'inside', box: { x: box.x + gap, y: box.y + gap, ...size } },
    { placement: 'below', box: { x: box.x, y: box.y + box.height + gap, ...size } },
  ];
  return places.find((p) => within(p.box, canvas) && !content.some((c) => overlaps(p.box, c))) ?? (places[2] as { box: Box; placement: Placement });
}

export function CanvasChrome() {
  const selection = useEditorState((s) => s.selection);
  // the primary selected node, read as the store holds it (a node object is replaced only when it changes)
  const node = useEditorState((s) => (s.selection[0] === undefined ? null : (locate(s.document, s.selection[0])?.node ?? null)));
  const hovered = useSyncExternalStore(hover.subscribe, hover.get);
  const drawnBand = useSyncExternalStore(band.subscribe, band.get);
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY);

  useEffect(() => {
    let request = 0;
    // nothing selected, hovered or banded: nothing to measure, and the last layout is dropped
    if (selection.length === 0 && hovered === null && drawnBand === null) {
      request = requestAnimationFrame(() => setLayout(EMPTY));
      return () => cancelAnimationFrame(request);
    }
    let placedFor = '';
    let placed: Layout['label'] = null;
    const measure = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const local = (b: Box | null): Box | null => (b === null ? null : { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height });
        const selected = selection.map((id) => local(nodeBox(iframe, id))).filter((b): b is Box => b !== null);
        const union = selection.length > 1 ? unionOf(selected) : null;
        // the label belongs to the one selected node, or to the union of several
        const first = union ?? selected[0];
        const size = label.current ? { width: label.current.offsetWidth, height: label.current.offsetHeight } : null;
        // the label is placed again only when its element or its size moved: reading the page's content is the slow part
        const key = JSON.stringify([first, size]);
        if (first === undefined || size === null) placed = null;
        else if (key !== placedFor) {
          const gap = parseFloat(getComputedStyle(layer.current as HTMLDivElement).getPropertyValue('--space-2')) || 0;
          const content = contentBoxes(iframe).map((b) => local(b) as Box);
          placed = placeLabel(first, size, gap, content, { x: 0, y: 0, width: origin.width, height: origin.height });
        }
        placedFor = key;
        const hoveredBox = hovered !== null && !selection.includes(hovered as (typeof selection)[number]) ? local(nodeBox(iframe, hovered)) : null;
        const next: Layout = { selected, union, hovered: hoveredBox, label: placed, band: local(drawnBand) };
        setLayout((before) => (same(before, next) ? before : next));
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [selection, hovered, node, drawnBand]);

  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
  const shown = selection.length === 0 && hovered === null && drawnBand === null ? EMPTY : layout;
  return (
    <div className="chrome" ref={layer} data-canvas-chrome>
      {shown.hovered ? <div className="chrome__hover" data-chrome="hover" style={at(shown.hovered)} /> : null}
      {drawnBand !== null && shown.band ? <div className="chrome__band" data-chrome="band" style={at(shown.band)} /> : null}
      {shown.selected.map((b, i) => (
        <div key={i} className="chrome__selection" data-chrome="selection" style={at(b)} />
      ))}
      {shown.union && selection.length > 1 ? <div className="chrome__union" data-chrome="union" style={at(shown.union)} /> : null}
      {selection.length > 1 ? (
        <div
          ref={label}
          className={`chrome__label${shown.label ? '' : ' is-measuring'}`}
          data-chrome="label"
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          <span className="chrome__name">{t('canvas.selectedCount', { count: selection.length })}</span>
        </div>
      ) : node !== null ? (
        <div
          ref={label}
          className={`chrome__label${shown.label ? '' : ' is-measuring'}`}
          data-chrome="label"
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          <span className="chrome__name">{node.name}</span>
          <small className="chrome__tag">{node.tag ?? ''}</small>
        </div>
      ) : null}
    </div>
  );
}
