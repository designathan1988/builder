// A Settings field shows its own last refusal beside the input until the person types again.
// The store owns the refusal; this hook only connects it to the field for one selected node.
import { useState } from 'react';
import type { CommandId } from '../../generated/ids.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';

export function useSettingsRefusal(command: CommandId, attribute: string | undefined, nodeId: string): { readonly text: string | null; readonly dismiss: () => void } {
  const t = useT();
  const refusal = useEditorState((state) => {
    const found = state.refusal;
    if (found === null || found === undefined || found.command !== command || state.selection.length !== 1 || state.selection[0] !== nodeId) return null;
    const args = found.args;
    if (attribute !== undefined && args !== null && typeof args === 'object') {
      const named = (args as { readonly attribute?: unknown; readonly setting?: unknown }).attribute ?? (args as { readonly setting?: unknown }).setting;
      if (named !== undefined && named !== attribute) return null;
    }
    return found;
  });
  const [dismissed, setDismissed] = useState<unknown>(null);
  return refusal === null || refusal === dismissed
    ? { text: null, dismiss: () => undefined }
    : { text: t(refusal.message.key, refusal.message.params), dismiss: () => setDismissed(refusal) };
}
