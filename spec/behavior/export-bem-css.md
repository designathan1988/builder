# export-bem-css — Exported CSS uses readable BEM classes and is deterministic

How Pager behaves, read from its source (`reference/Pager`). Source references are `path:line` inside Pager.

## Trigger

The export (spec export-zip): **Export** in the top bar, File › Export page HTML.

## Result

- Every node gets generated classes (`compileClasses`, `src/model/css.js`): a class shared by every node with the same
  declarations (`s-…`, a hash of the declarations), a key class and a paint class named after the element type
  (`src/features/export/index.js:101-162`), beside the author's classes.
- The stylesheet holds one rule per generated class; a change anywhere can renumber the shared classes.
- The file is written with the time of the export.

## Undo and redo

Exporting records nothing.

## Problems in Pager

1. **Hashed, shared classes** (`s-3f9a…`) make the CSS unreadable and change when an unrelated node changes. Required:
   an element with styles of its own gets a class derived from its layer name in BEM form: an element outside any
   styled element is a block (Hero → `hero`); a styled element inside a block is an element of it, named after the
   outermost styled ancestor below the page (Title inside Hero → `hero__title`, "Call to action" →
   `hero__call-to-action`); an element with an author class and styles of its own is a modifier of its first class
   (`card` named "Plano assinatura" → `card--plano-assinatura`). A name used twice gets a numeric suffix
   (`hero__title-2`); the author's classes are kept beside it (manifest feature `export-bem-css`).
2. **Unstyled nodes carry classes and rules.** Required: `css/styles.css` holds one rule per styled element and none
   for the others; no selector uses an id or a data attribute; the product name appears in no class and no rule.
3. **The same page exports to different files.** Required: two exports of the same document are byte-identical: the
   archive's entries carry a fixed time, not the time of the export.
