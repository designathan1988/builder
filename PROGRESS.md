# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-25, brief "a aplicação completa": every feature of groups 01-20)

- Group 01 and the foundation pass. One e2e suite at a time (E2E_WORKERS=4); helpers: 3. From now on: blocks of
  features built, then one full suite. A stale dev server under the other account holds port 5310 and cannot be
  killed from this session: every suite runs with E2E_PORT=5311.
- First task: the feature table, the runner and the census run on main (144640b); the door rule on every kind of door
  is on wip/feature-table, freed by answer 1.
- The user's answers (2026-09-25; docs/history.md "The user's answers"): 1) project-open-json: the runner does not
  compare the page's and the root's ids when the action replaces the whole document; release the door rule after it.
  2) drag-level-keys-escape's first step drops "before Footer" (the one authorized scenario edit; on main, b31f6b4).
  3) Shift/Ctrl on the Layers Page row does not add the page to the selection (the canvas's rule). 4) The style path
  comes first: inspector-number-fields, props-spacing, props-typography, color-picker, props-background,
  props-size-overflow, props-flex-container; helpers may advance others, the style ones are integrated first.
- Another writer session pushes to origin/main too (rename-element, the drag-level scenario, PROGRESS). Its
  rename-element let the page root be renamed and edited the committed tests/e2e/context-menu.spec.ts to suit it;
  both were undone here (the test is restored, the root refused) and the user told.
- Group 02 passing (24): select-click, layers-tree, keyboard-tree-walk, palette-click-insert, undo-redo,
  multi-select-click, marquee-select, delete-element, move-up-down, wrap-row-column, drag-reorder-canvas,
  drag-drop-inside, context-menu, duplicate, text-edit-inline, palette-drag-insert, unwrap, nest-into-previous,
  promote-out, hide-element, select-container-children, hand-keyboard-move, lock-element, rename-element. Rename
  refuses the page root (status.rename.root): the page's name is the page's (pages.rename); every other element
  command refuses it too.
- Group 03 passing: autosave-restore, project-save-json, ui-language; project-open-json is 4 of 5 (code on
  wip/project-open-json, answer 1). Group 04 passing: inspector-panel. Group 06 passing: page-properties (on
  branch integration). Contracts committed, code next: export-zip (06), elements-structure (07).

## Open findings

1. A node path cannot name a page itself nor tell apart two siblings with the same name (blocks no scenario yet).
5. canvas.tsx RULER_STEP = 200 is a constant in code. 6. panels.spec.ts, doors.spec.ts run doors without `runs()`.
9. inspector-fields.spec.ts checks the drawing follows the data, so wrong `drawnAs` data passes.
11. The renderer: newTab renders `target=""` (fix before elements-structure: `_blank` + `rel="noopener"`); a line
    break in textarea/option becomes `<br>` (elements-form-structure); a `}` in a style value (inspector-number-fields).
12. Under load, e2e timed out (a 'stable' File menu button; coordinates.spec.ts:181); reruns passed.
13. Insert's density labels overflow and overlap ("Two columns": 69 px text in a 50 px button).
14. sidebar.tsx writes the argument name "target" (the manifest's adapter.selection) and builds data-args apart.
15. shell.tsx keeps the fit zoom in useState (moves with the zoom commands).
18. A menu item run with Enter or a click closes the menu through onDone, so the focus falls to the page body; the
    backdrop's focus return is untested.
19. Canvas chrome not built yet: label hidden under the pointer, size chip, quick panel, label as a hit target;
    `selection.select` throws on a node the document lacks.
20. Layers' folds survive File › Open of another project.
22. Not built, no scenario: walking or inserting onto an off-screen element does not scroll it into view (the frame's
    scroll needs an owner, frame-owner rule); history.depth (80) is not enforced.
23. `src/manifest/check.ts` keeps its own htmlRefusal, a second content model beside src/core/elements/content-model.ts.
24. Escape on a focused palette tile is bound to focus.canvas (not built).
25. A Layers row's Shift/Ctrl doors have no data-door of their own; the census counts them only through scenarios.
26. marquee: Escape should cancel a band (drag.cancel is built); hidden and locked nodes are not left out
    (status.selection.skipped unused); a lost pointer restores it, untested.
27. M (hand.take) does not refuse a locked element yet.
28. Arrange › Move up/down enabled at an edge.
29. The runner selects a node with no point of its own by a descendant plus ArrowUp; adding one with Shift needs its
    Layers row and focus.canvas#key-escape-in-layers-tree (not built; multi-select-actions needs it); the census sees
    the canvas click named, not the substitute door run (both have their own tests).
30. Declared, not built: wrap refusals requiresParent, interactiveInside, formInForm, singleChild, labelOneControl;
    drop.emptyAimMin (40 px aim of an empty container); the hover label as a hit target (it covered a container's
    marquee corner); DESIGN's "a label hides while the pointer is over it" contradicts the label as a hit target.
31. Escape does not cancel a rename in Layers: no door of the manifest runs it (rename-element's field has one door).
32. With nothing selected the inspector still draws its sections under the hints (current-state.spec.ts needs them).
