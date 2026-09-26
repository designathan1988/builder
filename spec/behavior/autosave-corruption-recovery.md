# autosave-corruption-recovery — Recover from a corrupted saved project

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager. The versions are those of `autosave-crash-recovery.md`.

## Trigger

- Pager: when the saved record cannot be read, it opens the newest previous version that can, on its own (`src/features/documents/index.js:124-129`); when none can, it blocks saving, keeps the bad bytes and shows "Recovery required" with a toast (`:208-213`).

## Our rule

- At start, a saved record the project reader refuses (it cannot be read, or the model refuses it) is **left untouched** in storage. The editor opens the empty project, the status bar reads **Recovery required** (`status.save.recoveryRequired`), and the **recovery dialog** opens, listing the earlier versions IndexedDB keeps, the newest first, each with the time it was saved and its **Restore** button (`project.restoreVersion`, the version by its revision). With no version, the dialog says there is none.
- **Restore** loads exactly that version's document (read through the project reader every open uses), the selection and the history empty, the status bar saying so (`status.save.restored`); autosave then writes it, and it becomes the current record.
- Until a version is restored, or another project replaces the document (File › Open, File › New blank page), autosave writes nothing, so the corrupted record stays as it was. Closing the dialog changes nothing of that.

## Refusals

- A version the project reader refuses is refused naming why (`status.open.invalidArchive`), and nothing changes.

## Problems in Pager

1. **Pager picks a previous version on its own,** without saying which or letting the person choose. Required: the dialog lists the versions with their times, and the person restores one.
2. **"Recovery required" offers nothing to act on** but a reload. Required: the dialog and its Restore buttons.

## Undo and redo

Not undoable: restoring replaces the document, the history starting empty, as File › Open does.
