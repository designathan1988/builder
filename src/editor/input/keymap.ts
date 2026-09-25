// The keymap (ARCHITECTURE.md): the one owner of keys. It runs the shortcut doors
// of the manifest in their key contexts; there is no other key table. A context inherits the bindings of the contexts
// interactions.json names (text editing, menus, the palette, dialogs and fields inherit nothing, so they keep their
// own keys). A bound chord's browser default is prevented, whether or not its door runs yet (DESIGN.md "Keyboard
// model"); a door runs when shortcut-rule.ts says so (DESIGN.md "Build order").
import type { CommandId, DoorId, KeyContextId } from '../../generated/ids.ts';
import { normaliseChord } from '../../manifest/chord.ts';
import { keyContextChain, manifest, type DoorEntry } from '../../manifest/runtime.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { COMMANDS } from '../../app/commands.ts';
import { isBuilt } from '../../core/commands/registry.ts';
import { FEATURE_COMMANDS } from '../../generated/commands.ts';
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

// The chord shown next to a command's label: its first shortcut in the global context.
export function chordHint(command: CommandId): string | null {
  const door = shortcuts.find((d) => d.command.id === command && d.door.kind === 'shortcut' && d.door.context === 'global');
  return door && door.door.kind === 'shortcut' ? door.door.chord : null;
}

// The key context of the element that has focus: a field keeps its keys; a region names its context with
// data-key-context; the page body, where the focus rests after a press on the canvas (its overlay takes no focus),
// is the canvas's, which inherits the global context; everything else is the global context.
export function contextOf(target: EventTarget | null): KeyContextId {
  if (target instanceof HTMLElement) {
    if (target === target.ownerDocument.body) return 'canvas';
    if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return 'field';
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
// not available (a tile whose entry a later feature brings), so the key does nothing, as a click would. Any other
// focus adds nothing.
export function focusedArgs(target: EventTarget | null, command: CommandId): Readonly<Record<string, unknown>> | null {
  const control = target instanceof Element ? target.closest('[data-door]') : null;
  const ref = control?.getAttribute('data-door');
  if (!control || !ref || manifest.doorByRef.get(ref as DoorId)?.command.id !== command) return {};
  if (control.getAttribute('aria-disabled') === 'true') return null;
  const args: unknown = JSON.parse(control.getAttribute('data-args') ?? '{}');
  return args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
}

export function installKeymap(store: EditorStore, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    // during a pointer gesture the keys are the gesture's (pointer.ts)
    const gesture = openGesture();
    const binding = bindingFor(gesture?.context ?? contextOf(event.target), chordOf(event));
    if (!binding) return;
    // a bound chord is the editor's whether or not its door runs yet (DESIGN.md "Keyboard model")
    event.preventDefault();
    if (!shortcutRunsNow(binding)) return;
    const own = gesture ? {} : focusedArgs(event.target, binding.command.id);
    if (own === null) return;
    const dispatch = (gesture?.gesture.dispatch ?? store.dispatch) as (id: CommandId, args: unknown) => DispatchResult;
    dispatch(binding.command.id, { ...own, ...binding.door.args });
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
