// The canvas iframe (ARCHITECTURE.md): a same-origin iframe that only renders. It is sandboxed without scripts, has
// no event handler of its own and takes no pointer event: every pointer input arrives on the overlay above it
// (src/editor/input/pointer.ts). The renderer (src/core/render/render.ts) builds the page into its document once and
// then applies each change of the document to it. The frame is scaled with the standard CSS zoom (Chrome 128+), so
// the page lays out at its breakpoint's width and the stage shows it at the canvas zoom.
import { useEffect, useRef, useState } from 'react';
import { PageRenderer, renderModelFromManifest } from '../../core/render/render.ts';
import { manifest } from '../../manifest/runtime.ts';
import { useStore } from '../store.ts';
import { CanvasChrome } from './chrome.tsx';
import { registerFrame } from './coordinates.ts';

const MODEL = renderModelFromManifest(manifest.elements, manifest.properties);
// an empty page the renderer fills: no script, no style of the editor
const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

export function CanvasFrame({ width, zoom }: { readonly width: number; readonly zoom: number }) {
  const store = useStore();
  const view = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  // a layout measure (the height the view leaves the page), not editor state
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let stop = () => {};
    const start = () => {
      const target = frame.contentDocument;
      if (!target) return;
      const renderer = new PageRenderer(target, MODEL);
      renderer.mount(store.getState().document);
      stop();
      stop = store.subscribeDocument((change) => renderer.apply(change.before, change.after, change.patches));
    };
    // the srcdoc page may be ready already (a fast load) or still loading
    if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body) start();
    frame.addEventListener('load', start);
    return () => {
      frame.removeEventListener('load', start);
      stop();
    };
  }, [store]);

  useEffect(() => registerFrame(iframe.current), []);

  return (
    <div className="frame__view" ref={view}>
      <iframe ref={iframe} className="frame__page" srcDoc={PAGE} sandbox="allow-same-origin" tabIndex={-1} aria-hidden style={{ width, height: zoom > 0 ? height / zoom : 0, zoom }} />
      <div className="frame__overlay" data-canvas-overlay>
        <CanvasChrome />
      </div>
    </div>
  );
}
