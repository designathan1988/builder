// Preferences (ARCHITECTURE.md): the UI language and the theme, chosen with preferences.setLanguage and
// preferences.setTheme, stored and restored after a reload (features ui-language and theme-switch).
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../../generated/ids.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import { registerHandler } from '../../core/commands/registry.ts';
import { commandOf } from '../../manifest/runtime.ts';
import type { Store } from '../../core/store/store.ts';
import type { EditorUi } from '../state.ts';

export type Theme = CommandArgs['preferences.setTheme']['theme'];
// the themes preferences.setTheme offers, read from the manifest
const THEMES: readonly string[] = commandOf('preferences.setTheme').args.theme?.values ?? [];
const isTheme = (value: unknown): value is Theme => typeof value === 'string' && THEMES.includes(value);

export interface Preferences {
  readonly locale: Locale;
  readonly theme: Theme;
}

// a fresh profile: the default UI language of environment.json, and the system's colour scheme
export const INITIAL_PREFERENCES: Preferences = { locale: DEFAULT_LOCALE, theme: 'system' };

// Where preferences are kept between sessions; the browser's localStorage by default, a map in tests.
export interface PreferenceStorage {
  read(): string | null;
  write(text: string): void;
}

const KEY = 'preferences';

export const browserStorage: PreferenceStorage = {
  read: () => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  write: (text) => {
    try {
      window.localStorage.setItem(KEY, text);
    } catch {
      // storage refused (private window, quota): the preferences last for this session only
    }
  },
};

// The stored preferences, each one only when it is a value the manifest allows; the defaults otherwise.
export function loadPreferences(storage: PreferenceStorage): Preferences {
  const text = storage.read();
  if (text === null) return INITIAL_PREFERENCES;
  try {
    const stored = JSON.parse(text) as Record<string, unknown>;
    const locale = (LOCALES as readonly unknown[]).includes(stored.locale) ? (stored.locale as Locale) : INITIAL_PREFERENCES.locale;
    const theme = isTheme(stored.theme) ? stored.theme : INITIAL_PREFERENCES.theme;
    return { locale, theme };
  } catch {
    return INITIAL_PREFERENCES;
  }
}

// Writes the preferences every time a command changes them.
export function persistPreferences(store: Store<EditorUi>, storage: PreferenceStorage): () => void {
  let last = store.getState().ui.preferences;
  return store.subscribe(() => {
    const now = store.getState().ui.preferences;
    if (now === last) return;
    last = now;
    storage.write(JSON.stringify(now));
  });
}

export const setLanguage = registerHandler<'preferences.setLanguage', EditorUi>('preferences.setLanguage', ({ state }, args) => {
  if (state.ui.preferences.locale === args.locale) return { kind: 'change' };
  return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, locale: args.locale } } };
});

export const setTheme = registerHandler<'preferences.setTheme', EditorUi>('preferences.setTheme', ({ state }, args) => {
  if (state.ui.preferences.theme === args.theme) return { kind: 'change' };
  return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, theme: args.theme } } };
});
