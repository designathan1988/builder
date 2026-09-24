// Chords (ARCHITECTURE.md): how a shortcut door writes its keys. manifest:check refuses a chord this cannot read and
// two doors with one chord in one context; the keymap compares a pressed chord with the doors' chords through it.

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const NAMED_KEYS = new Set([
  'Enter', 'Escape', 'Delete', 'Backspace', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'ContextMenu',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

// "Shift+Ctrl+z" and "Ctrl+Shift+Z" are the same chord; null when the text is not a chord.
export function normaliseChord(chord: string): string | null {
  let key: string;
  let modifiers: string[];
  if (chord.endsWith('++')) {
    key = '+';
    const head = chord.slice(0, -2);
    modifiers = head === '' ? [] : head.split('+');
  } else {
    const parts = chord.split('+');
    key = parts.pop() ?? '';
    modifiers = parts;
  }
  if (key === '') return null;
  if (key.length === 1) key = key.toUpperCase();
  else if (!NAMED_KEYS.has(key)) return null;
  const seen = new Set<string>();
  for (const modifier of modifiers) {
    if (!(MODIFIER_ORDER as readonly string[]).includes(modifier) || seen.has(modifier)) return null;
    seen.add(modifier);
  }
  const ordered = MODIFIER_ORDER.filter((m) => seen.has(m));
  return [...ordered, key].join('+');
}
