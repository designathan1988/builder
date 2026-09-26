// The breakpoint the editor shows and edits (ARCHITECTURE.md, Command owners; spec breakpoints-switch): one of the
// breakpoint table's (properties.json `breakpoints`), a workspace preference restored after a reload, the base one
// while none is chosen. The frame's tabs switch it (view.setBreakpoint); the page inside the frame takes its width, and
// style writes go to its layer (the store's `layer`, with the style state of style-state.ts). The tabs, the canvas's
// width and the export's media queries all read the one table.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';

export const BREAKPOINTS = manifest.properties.breakpoints;
const BASE = BREAKPOINTS.find((b) => b.base) ?? BREAKPOINTS[0];
if (BASE === undefined) throw new Error('properties.json declares no breakpoint');
export const BASE_BREAKPOINT = BASE;

export type Breakpoint = (typeof BREAKPOINTS)[number];

// the breakpoint the editor shows now
export const activeBreakpoint = (ui: EditorUi): Breakpoint => BREAKPOINTS.find((b) => b.id === ui.preferences.breakpoint) ?? BASE;

// a stored breakpoint when it is one of the table's other than the base; undefined otherwise (the base)
export const readBreakpoint = (stored: unknown): string | undefined => (typeof stored === 'string' && stored !== BASE.id && BREAKPOINTS.some((b) => b.id === stored) ? stored : undefined);

export const setBreakpoint = registerHandler<'view.setBreakpoint', EditorUi>(
  'view.setBreakpoint',
  ({ state }, { breakpoint }) => {
    const chosen = BREAKPOINTS.find((b) => b.id === breakpoint);
    if (chosen === undefined) throw new Error(`view.setBreakpoint: no breakpoint ${breakpoint}`);
    const { breakpoint: _was, ...rest } = state.ui.preferences;
    void _was;
    const preferences = chosen.base ? rest : { ...rest, breakpoint: chosen.id };
    return { kind: 'change', ui: { ...state.ui, preferences }, message: message('status.breakpointActive', { breakpoint: { key: chosen.labelKey as MessageId } }) };
  },
  // a tab stands for its breakpoint being the one shown
  (state, args) => activeBreakpoint(state.ui).id === args.breakpoint,
);
