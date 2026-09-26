// Coordinates under zoom (ARCHITECTURE.md): the one place that converts between the page (the page's CSS pixels
// inside the iframe, from the top-left of the page, scroll included), the frame (the iframe's viewport: the page's
// CSS pixels from its visible top-left) and the screen (the editor window's client pixels). The iframe is scaled with
// the standard CSS zoom, so one page pixel is `zoom` screen pixels; its layout keeps the breakpoint's width.
import { NODE_ATTRIBUTE, nodeSelector } from '../../core/render/render.ts';
import type { Layout } from '../../core/ports/layout.ts';
import type { NodeId } from '../../generated/commands.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

// Where the frame sits on the screen, its zoom, and how far its page is scrolled.
export interface FrameGeometry {
  // the screen position of the iframe's content box
  readonly left: number;
  readonly top: number;
  readonly zoom: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

export function screenToFrame(point: Point, g: FrameGeometry): Point {
  return { x: (point.x - g.left) / g.zoom, y: (point.y - g.top) / g.zoom };
}

export function frameToScreen(point: Point, g: FrameGeometry): Point {
  return { x: g.left + point.x * g.zoom, y: g.top + point.y * g.zoom };
}

export function frameToPage(point: Point, g: FrameGeometry): Point {
  return { x: point.x + g.scrollX, y: point.y + g.scrollY };
}

export function pageToFrame(point: Point, g: FrameGeometry): Point {
  return { x: point.x - g.scrollX, y: point.y - g.scrollY };
}

export function screenToPage(point: Point, g: FrameGeometry): Point {
  return frameToPage(screenToFrame(point, g), g);
}

export function pageToScreen(point: Point, g: FrameGeometry): Point {
  return frameToScreen(pageToFrame(point, g), g);
}

// The geometry of an iframe now. Its zoom is its effective CSS zoom (its own and its ancestors', Chrome 128+), exact
// where a ratio of rounded offset sizes is not. Its box on the screen is already zoomed; its computed border and
// padding are not (the border as Chrome snaps it to whole screen pixels), so they are zoomed to reach the content box.
export function geometryOf(iframe: HTMLIFrameElement): FrameGeometry | null {
  const win = iframe.contentWindow;
  const zoom = iframe.currentCSSZoom;
  const box = iframe.getBoundingClientRect();
  if (!win || !iframe.contentDocument || !(zoom > 0) || box.width === 0) return null;
  const style = getComputedStyle(iframe);
  const left = box.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * zoom;
  const top = box.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * zoom;
  return { left, top, zoom, scrollX: win.scrollX, scrollY: win.scrollY };
}

// The element of the page under a screen point, or null outside the frame's viewport (a scrollbar is not the page).
export function elementAt(iframe: HTMLIFrameElement, point: Point): Element | null {
  const g = geometryOf(iframe);
  const doc = iframe.contentDocument;
  if (!g || !doc) return null;
  const f = screenToFrame(point, g);
  if (f.x < 0 || f.y < 0 || f.x >= doc.documentElement.clientWidth || f.y >= doc.documentElement.clientHeight) return null;
  return doc.elementFromPoint(f.x, f.y);
}

// The screen box of a page element: its frame box, scaled and placed.
export function screenBox(iframe: HTMLIFrameElement, element: Element): { x: number; y: number; width: number; height: number } | null {
  const g = geometryOf(iframe);
  if (!g) return null;
  const r = element.getBoundingClientRect();
  const topLeft = frameToScreen({ x: r.left, y: r.top }, g);
  return { x: topLeft.x, y: topLeft.y, width: r.width * g.zoom, height: r.height * g.zoom };
}

// The screen box inside a node's borders (its padding box), and whether one node's element holds another's: what the
// canvas measures a selection's distances to an ancestor's inner edges from (spec hover-measure).
export function innerBox(iframe: HTMLIFrameElement, id: string): { x: number; y: number; width: number; height: number } | null {
  const element = iframe.contentDocument?.querySelector(nodeSelector(id as NodeId));
  const g = geometryOf(iframe);
  const box = element ? screenBox(iframe, element) : null;
  const style = element ? iframe.contentWindow?.getComputedStyle(element) : undefined;
  if (!box || !g || !style) return null;
  const px = (value: string) => (parseFloat(value) || 0) * g.zoom;
  const [left, top, right, bottom] = [px(style.borderLeftWidth), px(style.borderTopWidth), px(style.borderRightWidth), px(style.borderBottomWidth)];
  return { x: box.x + left, y: box.y + top, width: box.width - left - right, height: box.height - top - bottom };
}
export function holdsNode(iframe: HTMLIFrameElement, ancestor: string, id: string): boolean {
  const doc = iframe.contentDocument;
  const outer = doc?.querySelector(nodeSelector(ancestor as NodeId));
  const inner = doc?.querySelector(nodeSelector(id as NodeId));
  return outer != null && inner != null && outer !== inner && outer.contains(inner);
}

// The node under a screen point: the deepest page element there that stands for a node (data-node, written by the
// renderer), or the page root where no element is (the page's own background); null outside the frame's viewport.
// The editor learns which node, never the element: only the renderer writes the page (lint rule builder/frame-owner).
export function nodeAt(iframe: HTMLIFrameElement, point: Point): { readonly node: string; readonly root: boolean } | null {
  const hit = elementAt(iframe, point);
  if (!hit) return null;
  const body = hit.ownerDocument.body;
  const owner = hit.closest(`[${NODE_ATTRIBUTE}]`) ?? body;
  const node = owner?.getAttribute(NODE_ATTRIBUTE) ?? null;
  return node === null ? null : { node, root: owner === body };
}

// Every node under a screen point, the deepest first, the page root last (a drag looks past the dragged element to
// what lies under it); empty outside the frame's viewport.
export function nodesUnder(iframe: HTMLIFrameElement, point: Point): string[] {
  const g = geometryOf(iframe);
  const doc = iframe.contentDocument;
  if (!g || !doc) return [];
  const f = screenToFrame(point, g);
  if (f.x < 0 || f.y < 0 || f.x >= doc.documentElement.clientWidth || f.y >= doc.documentElement.clientHeight) return [];
  const nodes: string[] = [];
  for (const element of doc.elementsFromPoint(f.x, f.y)) {
    const owner = element.closest(`[${NODE_ATTRIBUTE}]`) ?? doc.body;
    const node = owner?.getAttribute(NODE_ATTRIBUTE) ?? null;
    if (node !== null && !nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}

// The axis a node lays its children along: "x" for a flex row, "y" for a column and for block, grid and inline flow
// (spec drag-reorder-canvas, "Hit zones": vertical for block and column flex, horizontal for row flex).
export function flowAxis(iframe: HTMLIFrameElement, id: string): 'x' | 'y' {
  const element = iframe.contentDocument?.querySelector(nodeSelector(id as NodeId));
  const view = iframe.contentWindow;
  if (!element || !view) return 'y';
  const style = view.getComputedStyle(element);
  return style.display.includes('flex') && !style.flexDirection.startsWith('column') ? 'x' : 'y';
}

// The flow a node lays its children in, for a side drop (spec drag-layout, row 5): vertical (block, or a column flex),
// horizontal (a row flex that does not wrap), or null where children are not laid one after another along one line
// (a grid, a wrapping flex).
export function sideFlow(iframe: HTMLIFrameElement, id: string): 'vertical' | 'horizontal' | null {
  const element = iframe.contentDocument?.querySelector(nodeSelector(id as NodeId));
  const view = iframe.contentWindow;
  if (!element || !view) return null;
  const style = view.getComputedStyle(element);
  if (style.display.includes('grid')) return null;
  if (!style.display.includes('flex')) return 'vertical';
  if (style.flexWrap !== 'nowrap') return null;
  return style.flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
}

// Scrolls the canvas's page by a distance in screen pixels (the drag's autoscroll); whether it moved.
export function scrollPage(iframe: HTMLIFrameElement, screen: number): boolean {
  const view = iframe.contentWindow;
  const g = geometryOf(iframe);
  if (!view || !g) return false;
  const before = view.scrollY;
  view.scrollBy(0, screen / g.zoom);
  return view.scrollY !== before;
}

// A new zoom keeps the page point `at` screen px below the view's top there (spec zoom-keyboard-buttons: the middle of
// the view; zoom-wheel-pan: the pointer).
export function keepPagePoint(iframe: HTMLIFrameElement, before: number, after: number, at: number): void {
  const view = iframe.contentWindow;
  if (!view || before <= 0 || after <= 0) return;
  const point = view.scrollY + at / before;
  view.scrollTo(view.scrollX, point - at / after);
}

// What a resize starts from (spec resize-handles): the element's border box in CSS px, what its padding and border
// add to its content on each axis (the width and height it declares measure its content under content-box), whether
// it is positioned out of the flow (absolute or fixed: its left and top move with a west or north handle) and its
// computed left and top; null when the page does not draw it.
export interface ResizeBasis {
  readonly width: number;
  readonly height: number;
  readonly extraX: number;
  readonly extraY: number;
  readonly contentBox: boolean;
  readonly positioned: boolean;
  readonly left: number;
  readonly top: number;
}
export function resizeBasis(iframe: HTMLIFrameElement, id: string): ResizeBasis | null {
  const element = iframe.contentDocument?.querySelector(nodeSelector(id as NodeId));
  const view = iframe.contentWindow;
  if (!element || !view) return null;
  const style = view.getComputedStyle(element);
  const px = (value: string) => parseFloat(value) || 0;
  const box = element.getBoundingClientRect();
  return {
    width: box.width,
    height: box.height,
    extraX: px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth),
    extraY: px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth),
    contentBox: style.boxSizing === 'content-box',
    positioned: style.position === 'absolute' || style.position === 'fixed',
    left: px(style.left),
    top: px(style.top),
  };
}

// Every element the page draws, in document order: its node, its box and its padding on the screen, and whether it
// holds no element (spec canvas-outlines-zones)
export interface ElementBox {
  readonly id: string;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly padding: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly empty: boolean;
}
export function elementBoxes(iframe: HTMLIFrameElement): ElementBox[] {
  const page = iframe.contentDocument;
  const view = iframe.contentWindow;
  const g = geometryOf(iframe);
  if (!page || !view || !g) return [];
  const px = (value: string) => (parseFloat(value) || 0) * g.zoom;
  return [...page.querySelectorAll(`[${NODE_ATTRIBUTE}]`)].flatMap((element) => {
    const box = screenBox(iframe, element);
    if (box === null) return [];
    const style = view.getComputedStyle(element);
    return [
      {
        id: element.getAttribute(NODE_ATTRIBUTE) ?? '',
        box,
        padding: { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) },
        empty: element.querySelector(`[${NODE_ATTRIBUTE}]`) === null,
      },
    ];
  });
}

// A pan's scroll of the page, in page px (spec zoom-wheel-pan)
export function scrollPageBy(iframe: HTMLIFrameElement, by: number): void {
  iframe.contentWindow?.scrollBy(0, by);
}

// The screen box of a node's element, or null when the page does not draw it.
export function nodeBox(iframe: HTMLIFrameElement, id: string): { x: number; y: number; width: number; height: number } | null {
  const element = iframe.contentDocument?.querySelector(nodeSelector(id as NodeId));
  return element ? screenBox(iframe, element) : null;
}

// a CSS length in px as the page computes it, 0 for none
const cssPx = (value: string): number => parseFloat(value) || 0;

// The layout port of the core (src/core/ports/layout.ts), measured on the canvas's page: a node's box in page pixels,
// or null when the canvas does not draw it (no frame, or no element of that node).
export const pageLayout: Layout = {
  box(id) {
    const iframe = current;
    const g = iframe ? geometryOf(iframe) : null;
    const element = iframe?.contentDocument?.querySelector(nodeSelector(id));
    if (!g || !element) return null;
    const r = element.getBoundingClientRect();
    const topLeft = frameToPage({ x: r.left, y: r.top }, g);
    return { x: topLeft.x, y: topLeft.y, width: r.width, height: r.height };
  },
  place(id, within) {
    const element = current?.contentDocument?.querySelector(nodeSelector(id));
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return null;
    const style = view.getComputedStyle(element);
    const r = element.getBoundingClientRect();
    // the margin edge, in the frame's own pixels (the page's: the frame is scaled from outside)
    const edge = { left: r.left - cssPx(style.marginLeft), top: r.top - cssPx(style.marginTop), right: r.right + cssPx(style.marginRight), bottom: r.bottom + cssPx(style.marginBottom) };
    const size = { width: Math.round(cssPx(style.width)), height: Math.round(cssPx(style.height)) };
    // the containing block's padding edges: the viewport's, or the parent's border box less its borders
    const parent = element.parentElement;
    if (within === 'parent' && !parent) return null;
    const p = within === 'viewport' || !parent ? null : parent.getBoundingClientRect();
    const ps = p === null || !parent ? null : view.getComputedStyle(parent);
    const box =
      p === null || ps === null
        ? { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight }
        : { left: p.left + cssPx(ps.borderLeftWidth), top: p.top + cssPx(ps.borderTopWidth), right: p.right - cssPx(ps.borderRightWidth), bottom: p.bottom - cssPx(ps.borderBottomWidth) };
    return { left: Math.round(edge.left - box.left), top: Math.round(edge.top - box.top), right: Math.round(box.right - edge.right), bottom: Math.round(box.bottom - edge.bottom), ...size };
  },
};

// The page's content on the screen, which a canvas label must never cover (DESIGN.md "Label rule"): the box of
// every run of text and of every replaced element (an image, a video, an embedded frame, a form control).
const REPLACED = 'img, picture, video, audio, canvas, svg, iframe, embed, object, input, textarea, select, button, progress, meter';
export function contentBoxes(iframe: HTMLIFrameElement): { x: number; y: number; width: number; height: number }[] {
  const doc = iframe.contentDocument;
  const g = geometryOf(iframe);
  if (!doc || !g) return [];
  const toScreen = (r: DOMRect) => {
    const topLeft = frameToScreen({ x: r.left, y: r.top }, g);
    return { x: topLeft.x, y: topLeft.y, width: r.width * g.zoom, height: r.height * g.zoom };
  };
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    if ((text.textContent ?? '').trim() === '') continue;
    range.selectNodeContents(text);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) boxes.push(toScreen(r));
  }
  for (const element of doc.body.querySelectorAll(REPLACED)) {
    const r = element.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) boxes.push(toScreen(r));
  }
  return boxes;
}

// The CSS computed values of a node's element on the canvas's page, read through the typed object model
// (computedStyleMap: `auto` stays `auto`, a length is in px), so they are the values in force whatever sets them (the
// node's own styles, the browser's defaults); null when the canvas draws no element of the node. The inspector's
// collapsed sections summarise them (src/editor/inspector/sections.ts). A name the browser computes no property of (a
// recipe's own id, such as line-clamp, whose declarations are prefixed ones) reads as nothing: the typed object model
// throws on it.
export function computedValues(id: string, properties: readonly string[]): Readonly<Record<string, string>> | null {
  const element = current?.contentDocument?.querySelector(nodeSelector(id as NodeId));
  if (!element) return null;
  const map = element.computedStyleMap();
  return Object.fromEntries(properties.map((property) => [property, CSS.supports(property, 'initial') ? (map.get(property)?.toString() ?? '') : '']));
}

// The canvas's iframe, for the pointer owner and the canvas overlays.
let current: HTMLIFrameElement | null = null;

export function registerFrame(iframe: HTMLIFrameElement | null): () => void {
  current = iframe;
  return () => {
    if (current === iframe) current = null;
  };
}

export function canvasFrame(): HTMLIFrameElement | null {
  return current;
}
