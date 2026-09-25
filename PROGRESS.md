# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-25, brief "a aplicação completa": every feature of groups 01-20)

- Group 01 and the foundation pass. One e2e suite at a time (E2E_WORKERS=4), no dev server meanwhile; helpers: 3.
- First task: the feature table (src/app/features.ts) runs the runner, the census and the Insert tiles; next,
  project-save-json and project-open-json (File › Open loads every fixture), then every door gated by its feature.
- Group 02 passing: select-click, layers-tree, keyboard-tree-walk, palette-click-insert, undo-redo,
  multi-select-click, marquee-select, delete-element, move-up-down, wrap-row-column, drag-reorder-canvas,
  drag-drop-inside, context-menu, duplicate, text-edit-inline. Runner paths proven by switching them off: setup
  selection, canvas click, Tab to a control, modifier click, drag press, marquee, a slot with no free gap.
- To integrate: feature/palette-drag-insert, feature/drag-level-keys-escape, feature/hand-keyboard-move. Decisions
  by small ambiguity: docs/history.md, "Group 02" (the newest entry).

## Conditions the user set

- A runner path with no test of its own (drag, held drag, dwell, typing): its first feature switches it off to fail.
- Open finding 11's parts are fixed before the feature that needs them: a `}` in a style value before
  inspector-number-fields; a link's newTab as `target="_blank"` with `rel="noopener"` before elements-structure; a
  line break in textarea and option before elements-form-structure.

## Pending decisions of the user

- Shift/Ctrl+click on the Page row in Layers adds the page root to the selection (the canvas door's target
  "element" excludes it; the row doors have no such limit; Pager never adds it). Should the row doors exclude it?

## Open findings

1. A node path cannot name a page itself nor tell apart two siblings with the same name (blocks no scenario yet).
5. `src/editor/shell/canvas.tsx` RULER_STEP = 200 is a constant in code; no rule names the ruler marks.
6. `panels.spec.ts`, `doors.spec.ts` run doors their own way, not named with `runs()` (7: door.ts comment fixed).
9. inspector-fields.spec.ts checks the drawing follows the data, so wrong `drawnAs` data passes.
11. The renderer: newTab renders `target=""`; a line break in textarea/option becomes `<br>`; a `}` in a style value
    could break out of its node's rules (tied to features above).
12. Under load, e2e timed out a few times ('stable' File menu button, coordinates.spec.ts:181); reruns passed.
13. Insert's density labels overflow and overlap ("Two columns": 69 px text in a 50 px button).
14. sidebar.tsx writes the argument name "target" (the manifest's adapter.selection) and builds data-args apart.
15. shell.tsx keeps the fit zoom in useState; it moves to the store with the zoom commands.
18. A menu item run with Enter or a click (focus.activate) closes the menu through onDone, not a dismissal, so the
    focus still falls to the page body; the backdrop's focus return (ui.dismiss#overlay-backdrop) has no test.
19. Canvas chrome not built yet: label hidden under the pointer, size chip, quick panel, label as a hit target;
    `selection.select` throws on a node the document lacks. 20. Layers' folds survive File › Open of another project.
22. Not built, no scenario: walking or inserting onto an off-screen element does not scroll it into view (the
    frame's scroll needs an owner, frame-owner rule); history.depth (80) is not enforced.
23. `src/manifest/check.ts` keeps its own htmlRefusal, a second content model beside src/core/elements/content-model.ts.
24. Escape on a focused palette tile is bound to focus.canvas (not built). 25. A Layers row's Shift/Ctrl doors
    have no data-door of their own; the census counts them only through scenarios.
26. marquee: Escape during a band should cancel it (needs drag.cancel, not built); hidden and locked nodes are not
    left out (the model has no flags yet; status.selection.skipped unused); a lost pointer restores it, untested.
27. delete and move up/down do not refuse a locked element yet (status.locked.*): lock-element must add the check.
28. Arrange › Move up/down stay enabled at an edge (refused): the predicate is only hasSelection (DESIGN: disabled).
29. The runner selects a node with no point of its own by a descendant plus ArrowUp; adding one with Shift needs its
    Layers row and then focus.canvas#key-escape-in-layers-tree (not built; multi-select-actions needs it). The census
    reads the test list, so it sees the canvas click named, not the substitute door run (both have their own tests).
30. Declared, not built: wrap refusals requiresParent, interactiveInside, formInForm, singleChild, labelOneControl;
    drop.emptyAimMin (40 px aim of an empty container); the hover label as a hit target (it covered a container's
    marquee corner); DESIGN's "a label hides while the pointer is over it" contradicts the label as a hit target.
31. Ctrl+A while editing a text does nothing: it is text.selectAll (select-container-children, not built yet).
