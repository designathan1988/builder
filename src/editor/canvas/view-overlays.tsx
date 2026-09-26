// What the view switches draw over the page (spec canvas-outlines-zones; the switches: src/editor/view/overlays.ts):
// with Outlines, a dashed box around every element; with Zones, the padding of every container, tinted, and the
// content area of every empty container, marked as a drop area. Measured on every animation frame from the page's
// elements (coordinates.ts) while a switch is on; drawn in the canvas chrome, never in the page.
import { useEffect, useRef, useState } from 'react';
import { manifest } from '../../manifest/runtime.ts';
import { useEditorState } from '../store.ts';
import { canvasFrame, elementBoxes, type ElementBox } from './coordinates.ts';

// the elements that hold elements (elements.json: content "children")
const CONTAINERS = new Set(manifest.elements.elements.filter((e) => e.content === 'children').map((e) => e.id));

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// a container's padding as four bands inside its border box, and its content box
function paddingBands(b: ElementBox): Rect[] {
  const { box, padding } = b;
  return [
    { x: box.x, y: box.y, width: box.width, height: padding.top },
    { x: box.x, y: box.y + box.height - padding.bottom, width: box.width, height: padding.bottom },
    { x: box.x, y: box.y + padding.top, width: padding.left, height: box.height - padding.top - padding.bottom },
    { x: box.x + box.width - padding.right, y: box.y + padding.top, width: padding.right, height: box.height - padding.top - padding.bottom },
  ].filter((r) => r.width > 0 && r.height > 0);
}
const contentBox = (b: ElementBox): Rect => ({ x: b.box.x + b.padding.left, y: b.box.y + b.padding.top, width: b.box.width - b.padding.left - b.padding.right, height: b.box.height - b.padding.top - b.padding.bottom });

export function ViewOverlays() {
  const outlines = useEditorState((s) => s.ui.preferences.outlines === true);
  const zones = useEditorState((s) => s.ui.preferences.zones === true);
  const types = useEditorState((s) => s.document);
  const layer = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<readonly ElementBox[]>([]);

  useEffect(() => {
    if (!outlines && !zones) return;
    let request = 0;
    const read = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const next = elementBoxes(iframe).map((b) => ({ ...b, box: { ...b.box, x: b.box.x - origin.x, y: b.box.y - origin.y } }));
        setBoxes((before) => (same(before, next) ? before : next));
      }
      request = requestAnimationFrame(read);
    };
    request = requestAnimationFrame(read);
    return () => cancelAnimationFrame(request);
  }, [outlines, zones]);

  // each element's type, to tell a container
  const typeOf = new Map<string, string>();
  for (const page of types.pages) {
    const visit = (node: { id: string; type: string; children: readonly { id: string; type: string; children: readonly unknown[] }[] }) => {
      typeOf.set(node.id, node.type);
      for (const child of node.children) visit(child as typeof node);
    };
    visit(page.tree);
  }
  const containers = boxes.filter((b) => CONTAINERS.has(typeOf.get(b.id) ?? ''));
  const zoneRects = containers.flatMap((b) => [
    ...paddingBands(b).map((r, j) => ({ key: `${b.id}-p${j}`, rect: r, empty: false })),
    ...(b.empty ? [{ key: `${b.id}-e`, rect: contentBox(b), empty: true }] : []),
  ]);
  const at = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });
  return (
    <div className="chrome__view" ref={layer}>
      {outlines
        ? boxes.map((b, i) => <div key={b.id} className="chrome__outline" data-region={i === 0 ? 'canvas-outlines' : undefined} style={at(b.box)} />)
        : null}
      {zones
        ? zoneRects.map((z, i) => <div key={z.key} className={`chrome__zone${z.empty ? ' chrome__zone--empty' : ''}`} data-region={i === 0 ? 'canvas-zones' : undefined} style={at(z.rect)} />)
        : null}
    </div>
  );
}
