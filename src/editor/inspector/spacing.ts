// inspector.toggleSpacingLink (ARCHITECTURE.md, Command owners; spec props-spacing, Problems in Pager 1 and 2): whether
// a box of the box model editor (padding or margin) is edited as one value for its four sides. It changes only how the
// box is edited and writes nothing to the document (no undo step); it is an editor preference, the same for every
// element and kept after a reload (ui.preferences.spacingLinks). The status bar says the box is linked or unlinked; the
// link button stands for its box being linked.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

export type SpacingBox = 'padding' | 'margin';
export const SPACING_BOXES: readonly SpacingBox[] = ['padding', 'margin'];

export const isLinked = (ui: EditorUi, box: string): boolean => (ui.preferences.spacingLinks ?? []).includes(box as SpacingBox);

export const toggleSpacingLink = registerHandler<'inspector.toggleSpacingLink', EditorUi>(
  'inspector.toggleSpacingLink',
  ({ state, rules }, { box }) => {
    const linked = isLinked(state.ui, box);
    const now = SPACING_BOXES.filter((b) => (b === box ? !linked : isLinked(state.ui, b)));
    const { spacingLinks: _dropped, ...rest } = state.ui.preferences;
    void _dropped;
    const label = rules.compositeFacts.get(box)?.labelKey;
    const named = label === undefined ? box : { key: label };
    return {
      kind: 'change',
      ui: { ...state.ui, preferences: now.length > 0 ? { ...rest, spacingLinks: now } : rest },
      message: message(linked ? 'status.spacing.unlinked' : 'status.spacing.linked', { box: named }),
    };
  },
  (state, args) => isLinked(state.ui, String(args.box)),
);
