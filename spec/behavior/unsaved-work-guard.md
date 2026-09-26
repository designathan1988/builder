# unsaved-work-guard — Never lose an edit that is not yet saved

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager. Our autosave is `autosave-restore.md`.

## Trigger

- Pager writes the project after a delay (`docAutosave`, `src/features/documents/index.js:296-305`), and flushes what is pending on `pagehide` and on `visibilitychange` to hidden (`:342-343`).
- While something is not written (`docDirty`), `beforeunload` asks the browser for its leave-page confirmation (`:344`).
- A failed write shows "Save failed" and tries again after the delay (`:279-293`).

## Our rule

- Every committed change is written at once: first to the journal in localStorage, which a write finishes before the page can unload, then to IndexedDB (`src/editor/persistence/autosave.ts`). An immediate reload after a change finds it.
- While a change is not in IndexedDB yet (the status bar reads Saving…), or a write failed (Not saved), closing or reloading the tab triggers the browser's leave-page confirmation. Once the status reads Saved, nothing asks.
- A write IndexedDB refuses leaves the status bar reading **Not saved**, with the reason (`status.save.notSaved`), and the change kept in memory and in the journal. The next change writes again, and so does a retry after `autosave.retryDelay`; a success reads Saved.
- Hiding the tab (visibilitychange) or leaving it (pagehide) writes what is pending at once.

## Refusals

None: the guard asks the browser, never the person through a dialog of ours.

## Problems in Pager

1. **The first edits wait for a delay before anything is written,** so a reload right after an edit loses it unless `pagehide` happens to finish its asynchronous write. Required: the journal is written synchronously with the change; the reload finds it.
2. **"Save failed" gives no reason.** Required: Not saved says why (the browser's refusal: quota, blocked storage).
3. **A failure that never repeats leaves the work unsaved in silence.** Required: a failed write is retried on its own after a delay, and on the next change.

## Undo and redo

Not affected: saving records nothing.
