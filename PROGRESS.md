# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-25, brief "a aplicação completa": every feature of groups 01-20)

- Group 01 and the foundation pass. One e2e suite at a time (E2E_WORKERS=4), no dev server meanwhile; helpers: 3.
- First task: the feature table runs the runner, the census and the Insert tiles; every door gated by its feature
  (branch wip/feature-table) waits for project-open-json, whose File › Open loads every fixture.
- Group 03 passing: autosave-restore, project-save-json, ui-language. Waiting for the user: project-open-json (below; code on
  branch wip/project-open-json, 4 of 5 scenarios pass).
- Group 02 passing: select-click, layers-tree, keyboard-tree-walk, palette-click-insert, undo-redo,
  multi-select-click, marquee-select, delete-element, move-up-down, wrap-row-column, drag-reorder-canvas,
  drag-drop-inside, context-menu, duplicate, text-edit-inline, palette-drag-insert, unwrap, nest-into-previous,
  promote-out, hide-element, select-container-children, hand-keyboard-move. Conditions: a runner path is proven by its
  first feature switching it off; finding 11's parts are fixed before the feature that needs each.

## Pending decisions of the user

- Shift/Ctrl+click on the Page row in Layers adds the page root to the selection (the canvas door's target
  "element" excludes it; the row doors have no such limit; Pager never adds it). Should the row doors exclude it?
- Contested scenario project-open-json › the-empty-project-opens-without-asking: its diff keeps the page and the
  root of the empty project, whose ids are generated at start, but an opened file brings its own (p-home, n-page),
  and the runner compares those ids. Proposal: the diff names the opened ids (a page-level path, finding 1), or the
  runner compares the page's and the root's ids only when the action does not replace the document.
- Contested scenario drag-level-keys-escape › arrow-up-at-the-top-level-is-refused: its first drop "after Plans" can
  never be the first drawn (Plans' bottom edge is its list's and last item's; the innermost wins, a drag-reorder-canvas
  decision), so ArrowUp climbs instead of being refused. Proposal: its first step drops "before Footer" (same parent
  and index, same expectations). Code on branch feature/drag-level-keys-escape (3 of 4 scenarios pass).

## Open findings

1. A node path cannot name a page itself nor tell apart two siblings with the same name (blocks no scenario yet).
5. canvas.tsx RULER_STEP = 200 is a constant in code. 6. panels.spec.ts, doors.spec.ts run doors without `runs()`.
9. inspector-fields.spec.ts checks the drawing follows the data, so wrong `drawnAs` data passes.
11. The renderer: newTab renders `target=""` (fix before elements-structure: `_blank` + `rel="noopener"`); a line
    break in textarea/option becomes `<br>` (elements-form-structure); a `}` in a style value (inspector-number-fields).
12. Under load, e2e timed out a few times ('stable' File menu button, coordinates.spec.ts:181); reruns passed. 13.
    Insert's density labels overflow and overlap ("Two columns": 69 px text in a 50 px button). 14. sidebar.tsx
    writes the argument name "target" (the manifest's adapter.selection) and builds data-args apart.
15. shell.tsx keeps the fit zoom in useState (moves with the zoom commands). 18. A menu item run with Enter or a
    click closes the menu through onDone, so the focus falls to the page body; the backdrop's focus return is untested.
19. Canvas chrome not built yet: label hidden under the pointer, size chip, quick panel, label as a hit target;
    `selection.select` throws on a node the document lacks. 20. Layers' folds survive File › Open of another project.
22. Not built, no scenario: walking or inserting onto an off-screen element does not scroll it into view (the
    frame's scroll needs an owner, frame-owner rule); history.depth (80) is not enforced.
23. `src/manifest/check.ts` keeps its own htmlRefusal, a second content model beside src/core/elements/content-model.ts.
24. Escape on a focused palette tile is bound to focus.canvas (not built). 25. A Layers row's Shift/Ctrl doors
    have no data-door of their own; the census counts them only through scenarios.
26. marquee: Escape during a band should cancel it (drag.cancel is built now); hidden and locked nodes are not left
    out (no flags yet; status.selection.skipped unused); a lost pointer restores it, untested. 27. delete and move
    up/down do not refuse a locked element (lock-element adds it). 28. Arrange › Move up/down enabled at an edge.
29. The runner selects a node with no point of its own by a descendant plus ArrowUp; adding one with Shift needs its
    Layers row and then focus.canvas#key-escape-in-layers-tree (not built; multi-select-actions needs it). The census
    reads the test list, so it sees the canvas click named, not the substitute door run (both have their own tests).
30. Declared, not built: wrap refusals requiresParent, interactiveInside, formInForm, singleChild, labelOneControl;
    drop.emptyAimMin (40 px aim of an empty container); the hover label as a hit target (it covered a container's
    marquee corner); DESIGN's "a label hides while the pointer is over it" contradicts the label as a hit target.
31. Ctrl+A leaves out hidden siblings only; locked ones join when lock-element lands.
