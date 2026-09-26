# autosave-crash-recovery — Keep saved versions and restore the work after a crash

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager. Our autosave is `autosave-restore.md` and `unsaved-work-guard.md`.

## Trigger

- Pager keeps, with each saved record, the payloads it replaced: the five previous versions (`src/features/documents/index.js:100-110`, `previous … .slice(0, 5)`), with their save times.
- At start it opens the current record, or, when that cannot be read, the newest previous one that can (`:124-129`), and says the work was recovered (`toast(t("panel.documents.recovered"))`, `:206`).

## Our rule

- Every write IndexedDB holds is also kept as a **version**: the document, the selection and the time it was saved. The **last 10 versions** are kept, the oldest dropped first (`autosave.versions`).
- A **crash** is a session that ended before IndexedDB held its last change: the journal left in localStorage holds a newer revision than IndexedDB's record. At the next start the journal's work is restored (it is the last change the person made), written to IndexedDB, and the status bar says the work was recovered (`status.save.recovered`).
- A clean session (IndexedDB holds the last change) restores silently, as autosave-restore says.

## Refusals

None.

## Problems in Pager

1. **Only five versions, kept inside the record they belong to,** so a record that cannot be read takes its history with it. Required: ten versions, each its own entry, with its time.
2. **A change made just before the browser died is lost** when its delayed write had not run. Required: the journal written with every change brings it back, and the notice says so.

## Undo and redo

Not affected: the history starts empty after a start, as always.
