// The preview (DESIGN.md "Regions": preview-bar; spec preview-mode): while the editor previews (view/preview.ts), the
// preview bar replaces the top bar (its doors: the breakpoints, Exit preview, Export) and the page is shown as it is
// exported (core/export/export.ts previewPage), at the active breakpoint's width and at 100 %, in a frame of its own
// that runs it as a browser would (its scripts and embeds, its hover and details) and opens its links in a new tab:
// sandboxed, never the editing canvas. No selection, guides, handles, docks or rulers are drawn.
import { useMemo } from 'react';
import { previewPage } from '../../core/export/export.ts';
import { activeBreakpoint } from '../view/breakpoints.ts';
import { MODEL_RULES, useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { Slots } from './slots.tsx';

export function PreviewBar() {
  return (
    <header className="preview-bar" data-region="preview-bar" data-key-context="preview">
      <Slots region="preview-bar" />
    </header>
  );
}

export function PreviewPage() {
  const t = useT();
  const document = useEditorState((s) => s.document);
  const width = useEditorState((s) => activeBreakpoint(s.ui).width);
  const html = useMemo(() => previewPage(document, MODEL_RULES), [document]);
  return (
    <main className="preview-stage">
      <iframe className="preview__page" data-region="preview-page" title={t('preview.pageLabel')} srcDoc={html} sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" style={{ width }} />
    </main>
  );
}
