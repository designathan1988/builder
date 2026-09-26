// Edit on canvas (ARCHITECTURE.md, Command owners; spec spacing-handles, radius-border-gap-handles, shadow-handles): the
// mode in which the canvas draws the handles of one kind of value of the selection (padding or margin bands, the
// radius corner, border edges, gap bands, the shadow's handles). canvas.setEditMode chooses it from the quick panel's
// Edit on canvas menu; Escape in the canvas while a mode is on (the canvas-edit-mode key context) leaves it. A mode is
// editor state: nothing in the document changes and nothing is recorded; it stays while the selection changes.
//
// Which modes the menu offers usable: none, and a mode whose handles are built (the canvas-handle doors whose handle
// starts with the mode's name, their feature registered as built), so a mode never draws nothing (DESIGN.md "Build
// order"); a mode whose handles edit a structured value (a shadow's layers) applies to an element that holds one
// (modeApplies: spec shadow-handles, Problems in Pager 2), and is disabled with its reason on any other.
import { isFeatureBuilt } from '../../app/features.ts';
import { registerHandler } from '../../core/commands/registry.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import type { FeatureId, KeyContextId } from '../../generated/ids.ts';
import { commandOf, manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import type { DocNode } from '../../core/document/model.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import { storedLayers } from '../../core/style/set.ts';

export type EditMode = CommandArgs['canvas.setEditMode']['mode'];
const NONE: EditMode = 'none';

export const editMode = (ui: EditorUi): EditMode => ui.editMode ?? NONE;

export const setEditMode = registerHandler<'canvas.setEditMode', EditorUi>(
  'canvas.setEditMode',
  ({ state }, { mode }) => {
    if (editMode(state.ui) === mode) return { kind: 'change' };
    const { editMode: _dropped, ...rest } = state.ui;
    void _dropped;
    return { kind: 'change', ui: mode === NONE ? rest : { ...rest, editMode: mode } };
  },
  (state, args) => editMode(state.ui) === args.mode,
);

// the modes of canvas.setEditMode, in the manifest's order
export const EDIT_MODES: readonly EditMode[] = (commandOf(setEditMode.command).args.mode?.values ?? []) as EditMode[];

// the canvas-handle doors of a mode: those whose handle is the mode or names it first (shadow-blur; padding-top-band
// for padding)
export const handlesOf = (mode: EditMode) => manifest.doors.filter((d) => d.door.kind === 'canvas-handle' && (d.door.handle === mode || d.door.handle.startsWith(`${mode}-`)));

// whether a mode draws handles that run: none always
export const modeBuilt = (mode: EditMode): boolean => mode === NONE || handlesOf(mode).some((d) => isFeatureBuilt(d.door.feature as FeatureId));

// whether a mode's handles have something to edit on a node: a structured property they write holds layers there
export function modeApplies(mode: EditMode, node: DocNode, rules: ModelRules): boolean {
  const structured = [...new Set(handlesOf(mode).flatMap((d) => d.door.adapter.writes))].filter((p) => rules.structures.has(p));
  return structured.length === 0 || structured.some((p) => storedLayers(node, p, rules).length > 0);
}

// The key context of the canvas while a mode is on: its own, whose Escape leaves the mode (interactions.json
// canvas-edit-mode inherits the canvas's keys).
const EDIT_CONTEXT: KeyContextId = 'canvas-edit-mode';
const CANVAS_CONTEXT: KeyContextId = 'canvas';
export const keyContextIn = (ui: EditorUi, context: KeyContextId): KeyContextId => (context === CANVAS_CONTEXT && editMode(ui) !== NONE ? EDIT_CONTEXT : context);
