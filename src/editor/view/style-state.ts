// The style state the editor edits (ARCHITECTURE.md, Command owners; spec state-styles): one of properties.json's
// `states`, Base while none is chosen. The State menu chooses it (view.setStyleState); style writes go to its layer at
// the active breakpoint (the store's `layer`), and the canvas draws the selected elements with that state applied.
// Editor state, not a preference: a reload goes back to Base. Choosing it records nothing.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { activeBreakpoint } from './breakpoints.ts';

export const STATES = manifest.properties.states;
const BASE = STATES[0];
if (BASE === undefined) throw new Error('properties.json declares no state');
export const BASE_STATE = BASE;

// the state the editor edits now
export const activeState = (ui: EditorUi): (typeof STATES)[number] => STATES.find((s) => s.id === ui.styleState) ?? BASE;

// the layer style writes go to and the fields read: the active breakpoint and the active state
export const activeLayer = (ui: EditorUi): { readonly breakpoint: string; readonly state: string } => ({ breakpoint: activeBreakpoint(ui).id, state: activeState(ui).id });

export const setStyleState = registerHandler<'view.setStyleState', EditorUi>(
  'view.setStyleState',
  ({ state }, args) => {
    const chosen = STATES.find((s) => s.id === args.state);
    if (chosen === undefined) throw new Error(`view.setStyleState: no state ${args.state}`);
    const { styleState: _was, ...rest } = state.ui;
    void _was;
    const ui: EditorUi = chosen.id === BASE.id ? rest : { ...rest, styleState: chosen.id };
    return { kind: 'change', ui, message: message('status.styleStateActive', { state: { key: chosen.labelKey as MessageId } }) };
  },
  // a menu item stands for its state being the one edited
  (state, args) => activeState(state.ui).id === args.state,
);
