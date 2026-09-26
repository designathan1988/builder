// The keymap (ARCHITECTURE.md): the one owner of keys. It runs the shortcut doors
// of the manifest in their key contexts; there is no other key table. A context inherits the bindings of the contexts
// interactions.json names (text editing, menus, the palette, dialogs and fields inherit nothing, so they keep their
// own keys). A bound chord's browser default is prevented, whether or not its door runs yet (DESIGN.md "Keyboard
// model"); a door runs when shortcut-rule.ts says so (DESIGN.md "Build order"). While the hand holds an element
// (core/structure/hand.ts) the canvas's keys are the hand context's, and they act at the hand's aim. A command that
// takes what the system clipboard holds runs once the clipboard is read (src/editor/clipboard.ts). A door whose
// gesture gives a held key a meaning (a number field's Shift+ArrowUp) runs with that key held and hands it on.
import { previewing } from '../view/preview.ts';
import type { CommandId, DoorId, FeatureId, KeyContextId } from '../../generated/ids.ts';
import { normaliseChord } from '../../manifest/chord.ts';
import { keyContextChain, manifest, numberConstant, type DoorEntry } from '../../manifest/runtime.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { COMMANDS } from '../../app/commands.ts';
import { isBuilt } from '../../core/commands/registry.ts';
import { aimArgs, heldHand } from '../../core/structure/hand.ts';
import { isFeatureBuilt } from '../../app/features.ts';
import { TEXT_EDITING, editArgs } from '../canvas/text-edit.ts';
import { readClipboard } from '../clipboard.ts';
import type { EditorStore } from '../store.ts';
import { cancelPan, holdAlt, holdSpace, modifierOf, openGesture } from './pointer.ts';
import { shortcutRuns } from './shortcut-rule.ts';
import { keyContextIn } from '../canvas/edit-mode.ts';

// The key of an event as the manifest writes it: a letter or a digit by its physical key (so Ctrl+Alt+B is B on any
// layout), the other printable keys by the character they type, named keys by name.
function keyOf(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (event.key === ' ') return 'Space';
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

export function chordOf(event: KeyboardEvent): string {
  const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta'].filter((m): m is string => typeof m === 'string');
  const key = keyOf(event);
  // a shifted punctuation key types its own character ("+" is Shift+=): the character carries the Shift
  const shiftInKey = event.shiftKey && key.length === 1 && !/[A-Z0-9]/.test(key);
  return [...mods.filter((m) => !(shiftInKey && m === 'Shift')), key].join('+');
}

const shortcuts = manifest.doors.filter((d) => d.door.kind === 'shortcut');

// The binding of a chord in a context: its own shortcut first, then the contexts it inherits from.
export function bindingFor(context: KeyContextId, chord: string): DoorEntry | null {
  for (const c of keyContextChain(context)) {
    const found = shortcuts.find((d) => d.door.kind === 'shortcut' && d.door.context === c && normaliseChord(d.door.chord) === chord);
    if (found) return found;
  }
  return null;
}

// The chord shown next to a command's label: its first shortcut in the context the control acts in, else in a context
// that one inherits; the global context by default. The context menu acts on the canvas's selection, so its items
// show the canvas's keys (Alt+ArrowUp for Move up; spec context-menu, Problems in Pager 2).
export function chordHint(command: CommandId, context: KeyContextId = 'global'): string | null {
  for (const c of keyContextChain(context)) {
    const door = shortcuts.find((d) => d.command.id === command && d.door.kind === 'shortcut' && d.door.context === c);
    if (door && door.door.kind === 'shortcut') return door.door.chord;
  }
  return null;
}

// An HTML element of any window: the editor's, or the canvas frame's, whose elements are not instances of the
// editor's HTMLElement.
function htmlElement(target: EventTarget | null): HTMLElement | null {
  const view = typeof target === 'object' && target !== null && 'ownerDocument' in target ? (target as Node).ownerDocument?.defaultView : null;
  return view && target instanceof view.HTMLElement ? target : null;
}

// The key context of the element that has focus: the text edited in place on the canvas names its own context (the
// renderer marks it with data-key-context), and so may a field (the inspector's text field names
// element-text-field, which inherits the field's); any other field keeps its keys; a region names its context with
// data-key-context; the page body, where the focus rests after a press on the canvas (its overlay takes no focus),
// is the canvas's, which inherits the global context; everything else is the global context.
export function contextOf(event: EventTarget | null): KeyContextId {
  const target = htmlElement(event);
  if (target) {
    if (target === target.ownerDocument.body) return 'canvas';
    const field = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    const own = field ? target.getAttribute('data-key-context') : null;
    if (own && (manifest.interactions.keyContexts as readonly { id: string }[]).some((k) => k.id === own)) return own as KeyContextId;
    if (field) return 'field';
    const region = target.closest('[data-key-context]');
    const named = region?.getAttribute('data-key-context');
    if (named && (manifest.interactions.keyContexts as readonly { id: string }[]).some((k) => k.id === named)) return named as KeyContextId;
  }
  return 'global';
}

// Whether a shortcut door runs now (shortcut-rule.ts, the rule the door census reads too): its command is built and
// its feature introduces the command or has all its commands built.
export function shortcutRunsNow(entry: DoorEntry): boolean {
  return shortcutRuns({ command: entry.command.id, introducedBy: entry.command.introducedBy, feature: entry.door.feature }, (command) => isBuilt(COMMANDS[command as CommandId]), (feature) => isFeatureBuilt(feature as FeatureId));
}

// What a shortcut acts on when the focus is on a control of the same command drawn once per item (a palette tile):
// the arguments that control stands for (its data-args, written by the door's drawing), or null when that control is
// not available (a tile whose entry a later feature brings), so the key does nothing, as a click would. A field that
// names its own key context (the inspector's text field, a number field) stands for its control's arguments for every
// key of that context too, those the key's command takes (a number field's property, for its arrows and its Escape).
// A text field of such a control adds the text it holds as the command's one text argument the control and the door
// do not give (`content` for text.set, `value` for style.set and field.step): Enter keeps what was typed, an arrow
// steps it. Any other focus adds nothing.
// the argument a canvas handle's key takes the handle in (handle.step; canvas/handles.ts)
const HANDLE_ARG = 'handle';
export function focusedArgs(target: EventTarget | null, entry: DoorEntry): Readonly<Record<string, unknown>> | null {
  const control = target instanceof Element ? target.closest('[data-door]') : null;
  const drawn = manifest.doorByRef.get((control?.getAttribute('data-door') ?? '') as DoorId);
  const field = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target : null;
  const ownContext = field?.getAttribute('data-key-context') ?? null;
  const keyOfField = entry.door.kind === 'shortcut' && ownContext !== null && entry.door.context === ownContext;
  const sameCommand = drawn?.command.id === entry.command.id;
  if (!control || !drawn) return {};
  if (!(sameCommand || keyOfField)) {
    // a control of another command that stands for a node (a Layers row, its name) hands that node to a command that
    // takes one (the row's ArrowRight and ArrowLeft act on the focused row, spec layers-keyboard-navigation), and a
    // canvas handle hands itself to the command that takes a handle (its arrows: handle.step)
    const standsFor: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
    const stands = standsFor !== null && typeof standsFor === 'object' ? (standsFor as Record<string, unknown>) : {};
    // a control that is the key context its key waits in (a focused guide: Delete, L, spec guides-manual) hands what it
    // stands for that the key's command takes
    if (entry.door.kind === 'shortcut' && control.getAttribute('data-key-context') === entry.door.context) return Object.fromEntries(Object.entries(stands).filter(([name]) => name in entry.command.args));
    const node = stands.target;
    const handed = typeof node === 'string' && entry.command.args.target?.type === 'node' ? { target: node } : {};
    return typeof stands[HANDLE_ARG] === 'string' && HANDLE_ARG in entry.command.args ? { ...handed, [HANDLE_ARG]: stands[HANDLE_ARG] } : handed;
  }
  if (control.getAttribute('aria-disabled') === 'true') return null;
  const parsed: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
  const args = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const takes = entry.command.args;
  const own = sameCommand ? args : Object.fromEntries(Object.entries(args).filter(([name]) => name in takes));
  const text = Object.entries(takes).filter(([name, arg]) => (arg.type === 'string' || arg.type === 'json') && !(name in own) && !(name in entry.door.args));
  const into = text.length === 1 ? text[0]?.[0] : undefined;
  return field !== null && into !== undefined ? { ...own, [into]: field.value } : own;
}

// A shortcut door whose gesture says what a held key means (a number field's arrows: Shift ×10, Alt ×0.1, the gesture
// number-field-keys of interactions.json) runs with that key held too, when no door binds the chord itself: its door,
// and the key, which the command takes as its `modifier`.
export function heldKeyBinding(context: KeyContextId, event: KeyboardEvent): { readonly entry: DoorEntry; readonly modifier: string } | null {
  const modifier = modifierOf(event);
  if (modifier === null || modifier === 'several') return null;
  const entry = bindingFor(context, keyOf(event));
  if (!entry || entry.door.kind !== 'shortcut' || entry.door.gesture === null) return null;
  const gesture = manifest.interactions.gestures.find((g) => entry.door.kind === 'shortcut' && g.id === entry.door.gesture);
  return gesture?.modifiers.some((m) => m.key === modifier) === true ? { entry, modifier } : null;
}

// the key context of the keyboard's hand (interactions.json), which replaces the canvas's while it holds an element,
// and the Layers tree's too: an element is taken into the hand from either (M on the canvas, the context menu of a
// canvas element or of a Layers row, which gives the focus back to its row), and the hand's keys act wherever it was
// taken from
const HAND: KeyContextId = 'hand';
// the key context of the preview (interactions.json): its keys while the editor previews (spec preview-mode)
const PREVIEW: KeyContextId = 'preview';
// the key that measures distances on the canvas while it is held (spec hover-measure)
const ALT = 'Alt';
// The nudge keys (spec absolute-nudge): the arrows of the canvas-positioned context, which the canvas's keys are while
// every selected element is absolute or fixed (their command's predicate holds) and their feature is built; each moves
// the selection nudge.step px, nudge.shiftStep with Shift held (interactions.json)
const NUDGE_GESTURE = 'nudge-keys';
const NUDGE_DOORS = shortcuts.filter((d) => d.door.kind === 'shortcut' && d.door.gesture === NUDGE_GESTURE);
// The stepped keys: a door of such a gesture carries its direction (±1), which the held key's step multiplies:
// nudge.step, nudge.shiftStep with Shift (absolute-nudge's dx and dy); guides.keyStep, guides.keyShiftStep (a focused
// guide's delta, spec guides-manual)
const STEPPED: Readonly<Record<string, { readonly step: number; readonly shiftStep: number; readonly args: readonly string[] }>> = {
  [NUDGE_GESTURE]: { step: numberConstant('nudge.step'), shiftStep: numberConstant('nudge.shiftStep'), args: ['dx', 'dy'] },
  'guide-keys': { step: numberConstant('guides.keyStep'), shiftStep: numberConstant('guides.keyShiftStep'), args: ['delta'] },
};
const SHIFT = 'Shift';
const CANVAS: KeyContextId = 'canvas';
function positionedContext(store: EditorStore, context: KeyContextId): KeyContextId {
  const nudge = NUDGE_DOORS[0];
  if (context !== CANVAS || nudge === undefined || nudge.door.kind !== 'shortcut' || !isFeatureBuilt(nudge.door.feature as FeatureId)) return context;
  const why = store.refusal(nudge.command.id as CommandId, { ...nudge.door.args } as never);
  return why === null || why.key !== nudge.command.availability.refusalKey ? (nudge.door.context as KeyContextId) : context;
}
// a stepped key's travel: its door's direction times the step the held key gives
function stepped(gesture: string, args: Readonly<Record<string, unknown>>, modifier: string | null): Record<string, unknown> {
  const rule = STEPPED[gesture];
  if (rule === undefined) return { ...args };
  const step = modifier === SHIFT ? rule.shiftStep : rule.step;
  return { ...args, ...Object.fromEntries(rule.args.filter((name) => typeof args[name] === 'number').map((name) => [name, (args[name] as number) * step])) };
}
const HAND_FROM: readonly KeyContextId[] = ['canvas', 'layers-tree'];
// the contexts whose Space types: a field and the text edited in place (and the contexts that inherit the field's)
const FIELDS: readonly KeyContextId[] = (manifest.interactions.keyContexts as readonly { id: KeyContextId; inherits: string | null }[]).filter((k) => k.id === 'field' || k.id === TEXT_EDITING || k.inherits === 'field').map((k) => k.id);

// The arguments a key runs its command with: those the focused control stands for, then the door's own over them; an
// object argument both give is one object, the door's keys over the control's (a gradient stop stands for
// { edit: { stop: 2 } }, its ArrowLeft door gives { edit: { nudge: -1 } }: the key nudges that stop).
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function withDoorArgs(own: Readonly<Record<string, unknown>>, door: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...own };
  for (const [name, value] of Object.entries(door)) {
    const held = out[name];
    out[name] = isObject(held) && isObject(value) ? { ...held, ...value } : value;
  }
  return out;
}

// the arrows that move a slider, and which way
const SLIDER_KEYS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

export function installKeymap(store: EditorStore, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    // Alt held: the canvas measures distances while it is (spec hover-measure); it binds nothing alone
    if (event.key === ALT) holdAlt(true);
    // during a pointer gesture the keys are the gesture's (pointer.ts)
    const gesture = openGesture();
    const focused = contextOf(event.target);
    // Space held over the canvas arms the pan, whatever has the focus but a field or the text edited in place (spec
    // zoom-wheel-pan, Problems in Pager 2); Escape during a pan puts the view back (the pointer owner's)
    if (event.code === 'Space' && !FIELDS.includes(focused) && holdSpace(true)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && cancelPan()) {
      event.preventDefault();
      return;
    }
    // a slider (the colour picker's): Shift with an arrow moves it ten steps (spec color-picker, Problems in Pager 4);
    // its arrows alone are the browser's, one step
    const slider = event.target instanceof HTMLInputElement && event.target.type === 'range' ? event.target : null;
    const along = SLIDER_KEYS[event.key];
    if (slider !== null && along !== undefined && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (along > 0) slider.stepUp(10);
      else slider.stepDown(10);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // while the hand holds an element, the canvas's and the Layers tree's keys are the hand's (spec hand-keyboard-move,
    // "Trigger")
    const hand = gesture === null && HAND_FROM.includes(focused) ? heldHand(store.getState()) : null;
    // while an Edit on canvas mode is on, the canvas's keys are its mode's (canvas/edit-mode.ts)
    // while every selected element is absolute or fixed, the canvas's arrows nudge them (canvas-positioned)
    // while previewing, the keys are the preview's, wherever the focus is in the editor (spec preview-mode)
    const context = gesture?.context ?? (previewing(store.getState().ui) ? PREVIEW : hand !== null ? HAND : positionedContext(store, keyContextIn(store.getState().ui, focused)));
    const held = bindingFor(context, chordOf(event)) === null ? heldKeyBinding(context, event) : null;
    const binding = held?.entry ?? bindingFor(context, chordOf(event));
    if (!binding) return;
    // a bound chord is the editor's whether or not its door runs yet (DESIGN.md "Keyboard model")
    event.preventDefault();
    if (!shortcutRunsNow(binding)) return;
    // a key of the text edited in place acts on the edit: its node and the text it holds (text-edit.ts); a key of the
    // hand acts at its aim (hand.ts)
    const own = gesture
      ? {}
      : hand !== null
        ? aimArgs(hand, Object.keys(binding.command.args))
        : context === TEXT_EDITING
          ? editArgs(store.getState(), binding.command)
          : focusedArgs(event.target, binding);
    if (own === null) return;
    // the key held with a door whose gesture gives it a meaning, for a command that takes it
    const modifier = held !== null && 'modifier' in binding.command.args ? { modifier: held.modifier } : {};
    const dispatch = (gesture?.gesture.dispatch ?? store.dispatch) as (id: CommandId, args: unknown) => DispatchResult;
    const given = withDoorArgs({ ...own, ...modifier }, binding.door.args);
    const args = binding.door.kind === 'shortcut' && binding.door.gesture !== null ? stepped(binding.door.gesture, given, held?.modifier ?? null) : given;
    // a command that takes what the system clipboard holds (an argument of type clipboard: text.paste) runs once the
    // clipboard is read (src/editor/clipboard.ts); a key held during a gesture never waits for it
    const clipboard = Object.entries(binding.command.args).find(([name, arg]) => arg.type === 'clipboard' && !(name in args))?.[0];
    if (clipboard === undefined) dispatch(binding.command.id, args);
    else if (gesture === null) void readClipboard().then((content) => dispatch(binding.command.id, { ...args, [clipboard]: content }));
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') holdSpace(false);
    // Alt let go: the canvas stops measuring distances (spec hover-measure)
    if (event.key === ALT) holdAlt(false);
  };
  const onBlur = () => {
    holdSpace(false);
    holdAlt(false);
  };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  };
}
