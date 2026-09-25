// The keymap (ARCHITECTURE.md): the one owner of keys. It runs the shortcut doors
// of the manifest in their key contexts; there is no other key table. A context inherits the bindings of the contexts
// interactions.json names (text editing, menus, the palette, dialogs and fields inherit nothing, so they keep their
// own keys). A bound chord's browser default is prevented, whether or not its door runs yet (DESIGN.md "Keyboard
// model"); a door runs when shortcut-rule.ts says so (DESIGN.md "Build order"). While the hand holds an element
// (core/structure/hand.ts) the canvas's keys are the hand context's, and they act at the hand's aim.
import type { CommandId, DoorId, KeyContextId } from '../../generated/ids.ts';
import { normaliseChord } from '../../manifest/chord.ts';
import { commandOf, keyContextChain, manifest, type DoorEntry } from '../../manifest/runtime.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { COMMANDS } from '../../app/commands.ts';
import { isBuilt } from '../../core/commands/registry.ts';
import { aimArgs, heldHand } from '../../core/structure/hand.ts';
import { FEATURE_COMMANDS } from '../../generated/commands.ts';
import { TEXT_EDITING, editArgs } from '../canvas/text-edit.ts';
import type { EditorStore } from '../store.ts';
import { openGesture } from './pointer.ts';
import { shortcutRuns } from './shortcut-rule.ts';

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
  return shortcutRuns({ command: entry.command.id, introducedBy: entry.command.introducedBy, feature: entry.door.feature }, (command) => isBuilt(COMMANDS[command as CommandId]), FEATURE_COMMANDS);
}

// What a shortcut acts on when the focus is on a control of the same command drawn once per item (a palette tile):
// the arguments that control stands for (its data-args, written by the door's drawing), or null when that control is
// not available (a tile whose entry a later feature brings), so the key does nothing, as a click would. A text field
// of such a control (the inspector's text field, which stands for its node) adds the text it holds as the command's
// `content`, when the command takes one (Enter keeps what was typed). Any other focus adds nothing.
export function focusedArgs(target: EventTarget | null, command: CommandId): Readonly<Record<string, unknown>> | null {
  const control = target instanceof Element ? target.closest('[data-door]') : null;
  const ref = control?.getAttribute('data-door');
  if (!control || !ref || manifest.doorByRef.get(ref as DoorId)?.command.id !== command) return {};
  if (control.getAttribute('aria-disabled') === 'true') return null;
  const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
  const own = args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const typed = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target.value : null;
  return typed !== null && 'content' in commandOf(command).args ? { ...own, content: typed } : own;
}

// the key context of the keyboard's hand (interactions.json), which replaces the canvas's while it holds an element
const HAND: KeyContextId = 'hand';

export function installKeymap(store: EditorStore, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    // during a pointer gesture the keys are the gesture's (pointer.ts)
    const gesture = openGesture();
    const focused = contextOf(event.target);
    // while the hand holds an element, the canvas's keys are the hand's (spec hand-keyboard-move, "Trigger")
    const hand = gesture === null && focused === 'canvas' ? heldHand(store.getState()) : null;
    const context = gesture?.context ?? (hand !== null ? HAND : focused);
    const binding = bindingFor(context, chordOf(event));
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
          : focusedArgs(event.target, binding.command.id);
    if (own === null) return;
    const dispatch = (gesture?.gesture.dispatch ?? store.dispatch) as (id: CommandId, args: unknown) => DispatchResult;
    dispatch(binding.command.id, { ...own, ...binding.door.args });
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
