// The canvas iframe (ARCHITECTURE.md): a same-origin iframe that only renders. It is sandboxed without scripts, has
// no event handler of its own and takes no pointer event: every pointer input arrives on the overlay above it
// (src/editor/input/pointer.ts). The renderer (src/core/render/render.ts) builds the page into its document once and
// then applies each change of the document to it. One exception while a text is edited in place: the keymap listens
// for keys on the frame's window (the page itself still carries no event handler or event attribute), and the frame
// is not aria-hidden, as it holds the focus. The frame is scaled with the standard CSS zoom (Chrome 128+), so
// the page lays out at its breakpoint's width and the stage shows it at the canvas zoom.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageRenderer, renderModelFromManifest } from '../../core/render/render.ts';
import { applyInlineChange, plainText, type TextRange } from '../../core/text/inline.ts';
import { manifest } from '../../manifest/runtime.ts';
import { activeState } from '../view/style-state.ts';
import { installKeymap } from '../input/keymap.ts';
import { useEditorState, useStore } from '../store.ts';
import { CanvasChrome } from './chrome.tsx';
import { Guides } from './guides.tsx';
import { SnapLines } from './snap-lines.tsx';
import { keepPagePoint, registerFrame, scrollPageBy } from './coordinates.ts';
import { TEXT_EDITING, openLinkPrompt, registerEditReader } from './text-edit.ts';

const MODEL = renderModelFromManifest(manifest.elements, manifest.properties, manifest.interactions);
// an empty page the renderer fills: no script, no style of the editor
const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

export function CanvasFrame({ width, zoom }: { readonly width: number; readonly zoom: number }) {
  const store = useStore();
  const view = useRef<HTMLDivElement>(null);
  // the overlay over the page, where the chrome and the guides are drawn
  const overlay = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  // a layout measure (the height the view leaves the page), not editor state
  const [height, setHeight] = useState(0);
  // while a text is edited in place the frame holds the focus, so assistive technology must reach it
  const editing = useEditorState((s) => s.ui.textEdit.node !== null);

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
      const stopDocument = store.subscribeDocument((change) => renderer.apply(change.before, change.after, change.patches));
      // A text edited in place (text-edit.ts): the renderer marks, focuses and reads the edited element, and while the
      // edit lasts the keymap reads the keys on the frame's window, where they arrive; once it ends, the focus leaves
      // the frame for the editor's page body (the canvas key context).
      let edited: string | null = null;
      let lineBreaks = store.getState().ui.textEdit.lineBreaks;
      let selectAlls = store.getState().ui.textEdit.selectAlls;
      let changes = store.getState().ui.textEdit.changes;
      // while the link prompt holds the focus, the text selection it acts on, as a range of the edited text's characters
      let prompting = false;
      let kept: TextRange | null = null;
      let stopKeys = () => {};
      const followEdit = () => {
        const ui = store.getState().ui;
        const edit = ui.textEdit;
        if (edit.node !== edited) {
          edited = edit.node;
          stopKeys();
          stopKeys = () => {};
          renderer.editText(store.getState().document, edit.node, TEXT_EDITING);
          const view = frame.contentWindow;
          if (edit.node !== null && view) stopKeys = installKeymap(store, view);
          else if (frame.ownerDocument.activeElement === frame) frame.blur();
        }
        if (edit.lineBreaks !== lineBreaks) {
          lineBreaks = edit.lineBreaks;
          if (edit.node !== null) renderer.insertLineBreak();
        }
        if (edit.selectAlls !== selectAlls) {
          selectAlls = edit.selectAlls;
          if (edit.node !== null) renderer.selectEditedText();
        }
        // the link prompt opens: the selection it acts on is kept, as the prompt takes the focus
        const open = openLinkPrompt(ui) !== null;
        if (open && !prompting) kept = renderer.editedContent()?.range ?? null;
        // a change of the marks (spec text-inline-formatting): applied to the edited text's runs over its selection (or
        // the one the link prompt kept), and drawn with the range it leaves selected
        if (edit.changes !== changes) {
          changes = edit.changes;
          const content = edit.node !== null && edit.change !== null ? renderer.editedContent() : null;
          if (content !== null && edit.change !== null) {
            const end = plainText(content.runs).length;
            const after = applyInlineChange(content.runs, (prompting ? kept : null) ?? content.range ?? { start: end, end }, edit.change);
            renderer.showEdited(after.runs, after.range);
          }
        } else if (prompting && !open && edit.node !== null) renderer.focusEdited(kept);
        if (!open) kept = null;
        prompting = open;
      };
      const stopEdit = store.subscribe(followEdit);
      // a closed Details or Dialog is drawn open while it or something inside it is selected (editor-only)
      const reveal = () => renderer.reveal(store.getState().document, store.getState().selection);
      const stopReveal = store.subscribe(reveal);
      reveal();
      // the selected elements drawn as if the state the editor edits held (editor-only, spec state-styles)
      const preview = () => {
        const s = store.getState();
        const state = activeState(s.ui);
        renderer.previewState(s.document, s.selection, state.pseudo === null ? null : state.id);
      };
      const stopPreview = store.subscribe(preview);
      preview();
      const stopReader = registerEditReader(() => renderer.editedContent());
      followEdit();
      stop = () => {
        stopDocument();
        stopReveal();
        stopPreview();
        stopEdit();
        stopReader();
        stopKeys();
      };
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

  // a new zoom keeps the page point under its pivot there, the middle of the view without one (the camera keeps the
  // horizontal place); a pan's scroll of the page is carried out once
  const shown = useRef(zoom);
  const pivot = useEditorState((s) => s.ui.camera.pivot);
  useLayoutEffect(() => {
    const frame = iframe.current;
    if (frame && shown.current !== zoom) keepPagePoint(frame, shown.current, zoom, pivot !== null ? pivot.y - frame.getBoundingClientRect().top : height / 2);
    shown.current = zoom;
  }, [zoom, height, pivot]);
  const scroll = useEditorState((s) => s.ui.camera.scroll);
  const scrolled = useRef(scroll.count);
  useLayoutEffect(() => {
    const frame = iframe.current;
    if (frame && scroll.count !== scrolled.current) scrollPageBy(frame, scroll.by);
    scrolled.current = scroll.count;
  }, [scroll]);

  return (
    <div className="frame__view" ref={view}>
      <iframe ref={iframe} className="frame__page" srcDoc={PAGE} sandbox="allow-same-origin" tabIndex={-1} aria-hidden={editing ? undefined : true} style={{ width, height: zoom > 0 ? height / zoom : 0, zoom }} />
      <div className="frame__overlay" data-canvas-overlay ref={overlay}>
        <CanvasChrome />
        <Guides overlay={overlay} />
        <SnapLines overlay={overlay} />
      </div>
    </div>
  );
}
