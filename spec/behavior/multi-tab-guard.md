# multi-tab-guard — Only one tab edits the project at a time

Pager has no guard: two tabs of the app write the same IndexedDB record in turn, the last write winning (`src/features/documents/index.js`, `docWriteNowRun`, `:267-278`, writes whenever its own tab changed).

## Our rule

- The tab that opens first **edits**: it holds the editing lock (the browser's Web Locks, one lock for the project), writes autosave, runs every command.
- A tab that opens while another holds the lock is **read-only**: it shows the saved project, a notice across the window says the project is being edited in another tab (`tabGuard.readOnlyNotice`), with **Take over editing** (`project.takeOverEditing`). It never writes to IndexedDB, and every command that would change the document is refused with the status bar saying why (`status.tabGuard.readOnly`); the selection, the view and the panels still work.
- **Take over editing** takes the lock from the other tab and starts this tab again on the latest saved project, now editing. The other tab, its lock taken, becomes read-only at once, with a notice that another tab took over (`tabGuard.lostNotice`) and the same button. Its unsaved change, if any, is already in the journal and IndexedDB is written only by the tab that edits, so writes from two tabs never interleave.

## Refusals

- In a read-only tab, a command that changes the document: `status.tabGuard.readOnly`, nothing changes.

## Problems in Pager

1. **Two tabs write the same project in turn;** the one written last silently wins and the other's work is lost at the next start. Required: one editing tab, the others read-only, until one takes over.

## Undo and redo

A read-only tab records nothing: its document commands are refused.
