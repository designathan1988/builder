# ui-language — UI language: English by default, Brazilian Portuguese available

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- Pager has two catalogues in one module, English and `pt-BR` (`src/core/i18n.js`, the `LOCALES` table; the names `locale.name.en` "English" and `locale.name.pt-BR` "Portuguese (Brazil)", `:2776-2777`), and a switch, `setLocale(next)` (`:2789-2798`), which refuses an unknown locale and tells its subscribers (`onLocaleChange`, `:2786-2787`).
- **Nothing calls `setLocale`**: no menu item, button, command or key reaches it (the only occurrence of the name outside its definition is the command bar hint `command.hint.locale`, `:1352`). Observed: the app menu (File, Edit, Arrange, View, Help, Theme) has no language entry; every text shows in English, always.

## Result

- The active locale lives in a module variable (`activeLocale`, `:2781`), set to "en" at load and never stored: even if a switch existed, a reload would come back in English.
- Numbers and dates have one formatter each per locale (`formatNumber`, `formatDate`, `:2805-2826`); plural forms follow `Intl.PluralRules` (`pluralFormOf`, `:2834-2837`).

## Keyboard equivalent

None.

## Problems in Pager

1. **The Portuguese catalogue cannot be reached.** Required: View › Language and the status bar's language button offer English and Português (Brasil) (`preferences.setLanguage`, one door per language); choosing one re-renders every text of the editor at once, without a reload: menus, panels, tooltips, accessible names and the status bar's messages, which are written in the language shown when they are written.
2. **The choice is not stored.** Required: the language is kept in the preferences (the one preferences store, `src/editor/preferences/preferences.ts`) and restored after a reload; a fresh profile shows English.
3. **Nothing proves the two catalogues agree.** Required: a unit test proves that `en.json` and `pt-BR.json` have the same keys and, for every key, the same placeholders; a key missing from a catalogue throws, never falls back to another language.
4. **The page's own language is not the editor's.** Required: switching the editor's language never changes the page being edited (its content and the document's language settings are user content).
