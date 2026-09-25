// Coordinates under zoom (ARCHITECTURE.md): the one place that converts between the page (the page's CSS pixels
// inside the iframe, from the top-left of the page, scroll included), the frame (the iframe's viewport: the page's
// CSS pixels from its visible top-left) and the screen (the editor window's client pixels). The iframe is scaled with
// the standard CSS zoom, so one page pixel is `zoom` screen pixels; its layout keeps the breakpoint's width.
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
