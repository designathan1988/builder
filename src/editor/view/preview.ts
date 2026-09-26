// Preview (ARCHITECTURE.md, Command owners; spec preview-mode): the page shown as it is exported, without the editor's
// chrome. Ctrl+P, Ctrl+Enter or the top bar's Preview enter it; Escape, Ctrl+Enter or the preview bar's Exit leave it,
// with the selection it had given back. While it holds, the shell draws the preview bar and the exported page alone
// (src/editor/shell/preview.tsx), and the keys are the preview's (the keymap reads `previewing`). It never changes the
// document and records nothing; the zoom and the camera are not touched.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export const previewing = (ui: EditorUi): boolean => ui.preview !== undefined;

export const enterPreview = registerHandler<'view.enterPreview', EditorUi>('view.enterPreview', ({ state }) => {
  if (previewing(state.ui)) return { kind: 'change' };
  return { kind: 'change', ui: { ...state.ui, preview: { selection: state.selection } }, message: message('status.preview.on') };
});

export const exitPreview = registerHandler<'view.exitPreview', EditorUi>('view.exitPreview', ({ state }) => {
  const held = state.ui.preview;
  if (held === undefined) return { kind: 'change' };
  const { preview: _left, ...ui } = state.ui;
  void _left;
  return { kind: 'change', ui, selection: held.selection, message: message('status.preview.off') };
});
