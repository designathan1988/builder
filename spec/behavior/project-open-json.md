# project-open-json — Open a project archive

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- **File › Open project** (`#bO`, wired in `src/app/boot.js:376` to a hidden file input `bF`); the command bar's `project.open` clicks the same button (`src/features/workspace/dock.js:556`).
- The browser's file chooser opens; picking a file starts the read (`boot.js:379-400`); picking the same file twice reads it again (the input is cleared, `:381`). A read still running when another starts is dropped (`cancelProjectRead`, `:385`).

## What it reads

- A **JSON text file** (Pager's own save, `base-project.json`), read as text (`FileReader`, `:386-399`) and parsed (`readProject`, `src/features/export/index.js:71-79`): an older format is migrated first, then the envelope is checked (`assertEnvelope`); a newer format is refused by its code `PROJECT_NEWER_VERSION` (`src/features/documents/index.js:239-241`).
- No archive: a ZIP is not read.

## Result

- Accepted: the document is replaced at once (`openProject`, `export/index.js:80-90`): no question is asked, even when the current page holds work; the selection is cleared; the diagnostics readout says `Opened <file name>` (`boot.js:394`); the autosave then writes the opened project (`document:accepted`, `documents/index.js:335-339`).
- Refused (not JSON, not a project, a newer format): the readout says `Could not open: <why>` in its error style (`boot.js:396`); the current document stays as it was.

## Undo and redo

After an open the history starts empty: the opened project is not undoable into the previous one (`clearHistory`).

## Keyboard equivalent

The command bar (`project.open`); File › Open project through the menu's keys.

## Problems in Pager

1. **Opening replaces the work without asking.** A person who picks the wrong file loses the page on screen (the autosave then overwrites it). Required: before a valid project replaces a document that holds work (anything but the empty project), a confirmation asks (`dialog.openProject.message`, "Replace" / "Cancel", the command's `confirmation` in the manifest); Cancel leaves the document, the selection and the history as they were and the status bar says nothing changed; opening into the empty project asks nothing, as nothing would be lost. The file is read and checked before the question, so a refused file never asks.
2. **The archive Save project writes cannot be opened back**, because Pager reads JSON only. Required: File › Open reads the archive `project.zip` (its `project.json`, entries stored or deflated, as any ZIP tool writes them) and a bare `project.json` alike, through the one reader of a project document that the autosaved work also uses.
3. **A refusal is shown in a developer readout**, not where the person looks. Required: the status bar names the problem: `status.open.invalidArchive` with the reason (it is not a project document, or what the model rejects), `status.open.newerVersion` naming the version; the current document, selection and history are unchanged.
4. **Nothing on screen says the open happened.** Required: the status bar says the project was opened (`status.open.opened`); the selection and the undo history start empty, and the opened project is autosaved at once, so it survives an immediate reload.
