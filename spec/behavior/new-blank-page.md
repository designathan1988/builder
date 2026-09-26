# new-blank-page — Start over with a new blank page

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager.

## Trigger

- Pager: File › New blank page (`src/app/boot.js:363`) replaces the document with a blank one at once (`replaceDocument(BLANK(), …, true)`, `src/features/documents/index.js:182-192`), clearing the guides and the project's sections, with no question asked.

## Our rule

- **File › New blank page** (`project.newBlankPage`) replaces the project with the empty project: one page, Home, whose root, Page, holds nothing (the names in the language the editor shows, as at a first start).
- Over a project that holds work it asks first, in the manifest's words (`dialog.newBlankPage`): **Start over** replaces it, **Cancel** changes nothing and the status bar says so (`status.confirmation.cancelled`). Over the empty project it asks nothing.
- The selection and the undo history start empty; the inspector shows its tips for an empty selection (the empty page's hint).
- The status bar reads that a blank page was started (`status.project.blankPage`), and autosave writes the blank page, so a reload shows it.

## Refusals

None.

## Problems in Pager

1. **The page is replaced without asking,** and the work is gone (undo cannot bring it back: the history goes with it). Required: the confirmation, over a project that holds work.
2. **Nothing says what happened.** Required: the status bar says a blank page was started.

## Undo and redo

Not undoable: the history starts empty, as after File › Open.
