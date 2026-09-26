# color-swatches-eyedropper — Saved and recent colours and the eyedropper

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager. It extends `color-picker.md`.

## Trigger

- The colour picker shows two tabs, Saved and Recent (`src/features/inspector/properties.js:147`), each a list of colour swatches; a click on a swatch uses its colour.
- Apply remembers the colour it applies as the first recent colour (`:223`, `colorPickerRemember('recent', …)`).
- The eyedropper button (`:222`) opens Chrome's `EyeDropper` and uses the `sRGBHex` it returns; without the API the button is disabled.

## Result in the document

- Saved and recent colours are kept in the browser's preferences (`:133-135`, `workspace.colors.saved`, `workspace.colors.recent`), at most 48 saved and 12 recent, the newest first, each once.
- A swatch or the eyedropper writes the colour through the picker's session, as any part of it: Apply keeps it as one undo step, Cancel puts back the opening colour.

## Problems in Pager

1. **Saved colours belong to one browser, not to the project** (`:133`): another person, or the same project opened elsewhere, has none of them. Required: saved colours are stored with the project (the document's `swatches`), saved with Save current [colorPicker.saveCurrent] (`colors.saveSwatch`, one undo step with the picker's session) and taken away with a swatch's × (`colors.removeSwatch`); recent colours stay a person's own (the preferences): the last 10 applied, the newest first, each once.
2. **The saved and recent lists are hidden behind tabs**, one at a time. Required: both lists are drawn in the picker, the saved colours with Save current, the recent ones under them.
3. **The eyedropper is drawn disabled where the browser has no EyeDropper**, a control that looks usable but can never work there. Required: without the API the eyedropper is not drawn.
4. **Save current saves whatever text the picker holds, a colour already saved again** (`:135` dedupes only by text). Required: a colour already saved is not saved twice and records nothing.
