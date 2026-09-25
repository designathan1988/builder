# project-save-json — Save the project as one archive file

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- **File › Save project** (`#bS`, `index.html:38`, wired in `src/app/boot.js:365` to `downloadProject`); the command bar's `project.save` clicks the same button (`src/features/workspace/dock.js:555`).
- No shortcut. Always available: there is always a document to save.

## Result

- Pager downloads **one JSON text file**, `base-project.json` (`src/features/export/index.js:92-97`): a blob URL clicked through a temporary link, revoked 4 s later, and the diagnostics readout says `Saved: base-project.json`.
- The text is the persisted envelope (`toPersistent`, `src/commands/persist/envelope.js:54-70`), pretty-printed with two spaces: `format` (2), `app` ("Base"), `saved` (the save time), and `pages`, the first page carrying the live tree and its settings (language, direction, class styles, layer colours).
- The live tree is validated first (`saveProject`, `export/index.js:66-70`); an invalid tree throws and nothing is downloaded.
- Assets and any other file of the project are not in the download: only the document text.

## Visual feedback

| Stage | What is drawn |
|---|---|
| After Save project | The browser's download of `base-project.json`; the diagnostics readout (a developer panel) reads `Saved: base-project.json`. The status bar says nothing. |

## Undo and redo

Saving changes nothing in the document and records nothing in the history.

## Keyboard equivalent

The command bar (`project.save`); File › Save project through the menu's keys.

## Problems in Pager

1. **The download holds the document text only.** Files the project keeps next to the document (images, fonts, other files added later) are not in it, so a saved project reopened elsewhere loses them. Required: the download is one archive, `project.zip`, holding `project.json` and every file the project stores, each at its path in the project.
2. **The save time is written inside the document text** (`saved`), so two saves of the same document differ inside `project.json`. Required: `project.json` is the document alone, the same JSON the editor holds (its format version and its pages, and every setting the document holds), and nothing that depends on the editor session (no selection, zoom, DOM ids or save time); saving the same document twice gives byte-identical archives apart from the saved timestamp, which the archive keeps as its entries' modification time (from the clock port).
3. **Nothing tells the person the save happened** except a developer readout. Required: the status bar says the project was saved and under which file name (`status.project.saved`).
4. **Two formats in play** (Pager's `format`/`app` envelope versus the live shape, converted at a boundary). Required: `project.json` carries the same format version the autosaved record and File › Open read (the document's `version`), so the one reader of a project document opens both.
