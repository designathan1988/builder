# page-properties — The page's title, language and direction

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- **Page** in the top bar (`#pageProperties`, `index.html:78`, labelled "Page properties"): a click selects the page root and opens the inspector (`src/features/workspace/dock.js:160`).
- The empty inspector (nothing selected) offers the same action as a button, which clicks the top bar's Page (`src/features/inspector/properties.js:2758-2768`).
- No shortcut.

## Result

- The page root becomes the selection and the inspector shows it like any element: the Tag field (`div`, with section, header, main, footer, nav, aside and article offered), Attributes, the inline style (`background:#FFFFFF;color:#0F172A`), Layout, Space, Size, Paint, Border, Text and Effects. Observed after a click on Page: the canvas label reads `<div> Page` and the status bar says nothing new.
- **The title** of the exported page is the page root's layer name (`src/features/export/index.js:172`, `model.name||"Page"`): it changes only by renaming the Page layer.
- **The language and the direction** are stored in the project's page record (`page:{lang:"en",dir:"ltr",…}`, `export/index.js:46`). They are read through `pageLangOf` (a value not shaped like `xx` or `xx-YYYY` silently becomes `en`) and `pageDirOf` (anything but `ltr` or `rtl` silently becomes `ltr`) (`src/model/tree.js:66-76`). No control of the interface writes them: only a project file brings other values.
- The canvas writes the language on the frame's `<html>` (`src/platform/canvas/projector.js:465`) but not the direction; the direction reaches the page only as a CSS `direction:` declaration on the root (`src/model/css.js:16`). The export writes both on `<html lang dir>` (`export/index.js:172`).

## Visual feedback

| Stage | What is drawn |
|---|---|
| After a click on Page | The page root drawn selected on the canvas; the inspector shows its element properties. The status bar says nothing. |
| Title, language, direction | Nothing: there is no control for them. |

## Undo and redo

Selecting the page root records nothing. Renaming the Page layer (the only way to change the title) is one undo step of the rename. The language and the direction cannot change, so nothing is recorded for them.

## Keyboard equivalent

None in Pager beyond Tab to the top bar's Page and Enter.

## Problems in Pager

1. **No control sets the title, the language or the direction.** A professional cannot give the page a real `<title>`, declare it Portuguese or make it right-to-left without editing a project file. Required: **Page properties** (the inspector header's button, DESIGN.md `inspector-header` 4) selects the page root and shows the inspector's **Settings** tab, whose first fields are **Page title**, **Page language** and **Text direction** (the page attributes of `elements.json`, in their order). Each field keeps its value on Enter or when it loses focus, through `page.setSetting`: one undo step per change that changes something, undo restoring the value and the selection, and the status bar names the setting and its new value (`status.page.settingSet`). The selection stays the page root.
2. **The title is the root's layer name**, so renaming the Page layer silently rewrites the exported `<title>`, and every new project is titled "Page". Required: the title is a setting of its own (`pageTitle` on the page root); renaming the layer never changes it, and setting it never renames the layer.
3. **A wrong language silently becomes `en`** at render and export, so the page ends up declared English without anyone having chosen it. Required: the language must have BCP 47 syntax and a known language subtag, or be a valid private-use tag (`x-private`). `banana` is refused even though its letters fit the syntax. The status bar and the field beside the input say which value and setting were refused (`status.page.settingInvalid`); the document keeps its value, nothing is recorded, and the field shows the document's value again. The same holds for a direction other than `ltr`, `rtl` or `auto` (the keywords `elements.json` gives `pageDirection`; Pager drops `auto`).
4. **The canvas gets the language but not the direction**, which only arrives as a CSS declaration, so the edited page does not show what the exported one does (form controls and the bidi algorithm follow `dir`, not only `direction`). Required: the canvas frame's `<html>` carries `lang` and `dir` from the page settings as soon as they change, so a right-to-left page is drawn right-to-left in the editor (the page root's computed `direction` is `rtl`), and the settings are saved with the document (they survive an immediate reload). The export writes them on `<html>` (feature export-zip).
5. **An emptied field has no meaning** in Pager (there is no field). Required: emptying a field and keeping it removes the setting from the page root; the page then has no title, language or direction of its own (the export decides what it writes then, feature export-zip).
