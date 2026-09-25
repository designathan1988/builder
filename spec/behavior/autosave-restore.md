# autosave-restore — Autosave to IndexedDB and restore the work after a reload

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test document: a fresh profile, then a Section inserted from Elements.

## Trigger

- Every committed change of the document or of the project (`onDocChange(docAutosave)`, `onProjectChange(docAutosave)`, `src/features/documents/index.js:334`) schedules a write; a change that leaves the saved text as it was schedules nothing (`docAutosave` compares a snapshot, `:296-305`).
- The write happens **1000 ms** after the last change (`docSaveDelay`, `:214`; `setTimeout`, `:304`), one write at a time through a queue (`docEnqueue`, `:253-257`); a write that fails re-arms the timer (`:283-291`).
- Leaving the page (`pagehide`, `visibilitychange` to hidden) asks for a flush of the pending write (`:340-341`); the flush is an asynchronous IndexedDB write that the unload may cut short.
- The selection and the breakpoint and state are stored apart, in the preferences (`localStorage["base-editor-context"]`), on every selection change (`docRememberWorkspace`, `:220-226`, `:338`).

## Storage

- IndexedDB database `base-document-v1`, store `documents` (key path `id`), record `working`: `{ id, payload, name, saved, previous }`, where `payload` is the saved project text (`saveProject`, the same text File › Save project writes, with `format` and `app`), observed after inserting a Section (`:267-278`).
- The selection lives in `localStorage["base-editor-context"]` as `{"selection":[<uid>…],"context":{"state":null,"breakpoint":null}}` (observed).

## Restore

- At start the body is inert and the status reads `Loading…` (`:313-316`); the record is read, validated (a newer format refuses, an older one is migrated, a broken one falls back to an earlier revision, `:242-252`), opened, the selection and context restored from the preferences, and the history cleared (`:323`).
- Observed: a Section inserted and selected; reload; the Section is back and still selected, and the undo history is empty.
- A fresh profile with no record shows the empty page and `Not saved` (`:326`).

## Visual feedback

| Stage | What is drawn |
|---|---|
| Fresh profile | The status bar's save chip reads `Not saved`. |
| After a change | The chip reads `Saving…` until the write completes, then `Saved` (`docMarkSaved`, `:258-266`). |
| A write failed | `Save failed`, and the chip keeps its unsaved look. |
| After a reload | `Loading…`, then `Saved` once the record is restored. |

## Result

- The work (every page tree and project setting) and the selection are what they were before the reload; the undo and redo history starts empty.

## Undo and redo

- Autosave records nothing in the history. An undo or a redo is a change like any other and is saved; after a reload the history is empty.

## Keyboard equivalent

None: saving needs no action.

## Problems in Pager

1. **A change made less than a second before a reload can be lost.** The write waits 1000 ms after the last change; on leaving the page Pager only starts an asynchronous flush, which the unload can abort. Required: a committed change is written to the store as soon as it is committed (no waiting period), so the document survives an immediate reload.
2. **The selection is stored apart from the document** (the document in IndexedDB, the selection in `localStorage`, written at different moments). After a crash between the two writes the restored selection can name nodes of another revision, or nothing. Required: the document and the selection are one record, written together in one IndexedDB transaction, and restored together.
3. **The record's format is Pager's file format mixed with record fields** (`payload` text plus `name`, `saved`, `previous`). Required: the record carries the format version of the saved project from the first save, the same version `project.json` carries (project-save-json), so every future migration is exercised on the real loading path.
4. **"Saved" is the only proof shown**, and it is a label. Required (tests): the proof is the document and the selection read back after an immediate reload, never the label.
