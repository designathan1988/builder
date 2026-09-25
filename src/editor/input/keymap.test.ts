import { describe, expect, it } from 'vitest';
import { bindingFor, chordHint, chordOf } from './keymap.ts';

const key = (init: Partial<KeyboardEvent> & { key: string; code: string }): KeyboardEvent =>
  ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

describe('the keymap', () => {
  it('reads a key press as the chord the manifest writes', () => {
    expect(chordOf(key({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('Ctrl+Z');
    expect(chordOf(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    // on Windows Ctrl+Alt is AltGr: the physical key still names the letter
    expect(chordOf(key({ key: '∫', code: 'KeyB', ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+B');
    expect(chordOf(key({ key: '\\', code: 'Backslash', ctrlKey: true }))).toBe('Ctrl+\\');
    // "+" is typed with Shift: the character carries the Shift
    expect(chordOf(key({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }))).toBe('Ctrl++');
  });

  it('runs the shortcut doors of the manifest in the global context', () => {
    expect(bindingFor('global', 'Ctrl+Z')?.command.id).toBe('history.undo');
    expect(bindingFor('global', 'Ctrl+Shift+Z')?.command.id).toBe('history.redo');
    expect(bindingFor('global', 'Ctrl+Y')?.command.id).toBe('history.redo');
    expect(bindingFor('global', 'Ctrl+B')?.command.id).toBe('workspace.toggleLeftDock');
    expect(bindingFor('global', 'Ctrl+Alt+B')?.command.id).toBe('workspace.toggleInspector');
    expect(bindingFor('global', 'Ctrl+\\')?.command.id).toBe('workspace.collapseDocks');
  });

  it('lets a context inherit only what interactions.json says: a field and text editing keep their own keys', () => {
    expect(bindingFor('canvas', 'Ctrl+B')?.command.id).toBe('workspace.toggleLeftDock');
    expect(bindingFor('field', 'Ctrl+B')).toBeNull();
    // while editing text Ctrl+B is Bold, never the sidebar
    expect(bindingFor('text-editing', 'Ctrl+B')?.command.id).toBe('text.toggleBold');
    expect(bindingFor('text-editing', 'Ctrl+K')?.command.id).toBe('text.editLink');
    expect(bindingFor('text-editing', 'Ctrl+Shift+K')?.command.id).toBe('commandBar.open');
  });

  it('shows a command’s global shortcut as its hint', () => {
    expect(chordHint('history.undo')).toBe('Ctrl+Z');
    expect(chordHint('workspace.collapseDocks')).toBe('Ctrl+\\');
    expect(chordHint('preferences.setTheme')).toBeNull();
  });

  it('shows the shortcut of the context a control acts in, or of a context it inherits', () => {
    expect(chordHint('element.moveUp')).toBeNull();
    expect(chordHint('element.moveUp', 'canvas')).toBe('Alt+ArrowUp');
    expect(chordHint('element.delete', 'canvas')).toBe('Delete');
    expect(chordHint('history.undo', 'canvas')).toBe('Ctrl+Z');
  });
});
