# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-25, group 02 in progress)

- Group 01 and the foundation pass (runner, pointer.ts, menu doors, shortcut rule, lint rules: docs/history.md).
- Group 02 brief (user): a coordinator opens up to 3 helpers at once, each in a git worktree `.cache/wt/<feature>`
  (branch feature/<feature>, node_modules junction, own E2E_PORT/TOOTH_PORT), and integrates one at a time after
  verify:fast, e2e with the census, e2e:tooth and the status. Done: findings 16 and 17.
- Group 02 passing: select-click, layers-tree, keyboard-tree-walk, palette-click-insert, undo-redo,
  multi-select-click, marquee-select. Also built: the editor-only 40 px minimum height of an empty container, a
  layout port for the core (src/core/ports/layout.ts). Runner paths proven by switching them off: setup selection,
  canvas click, focusing the control a shortcut acts on (Tab), modifier click, drag press, marquee.
- Decisions by small ambiguity: docs/history.md, "Group 02" (the newest entry).

## Conditions the user set

- Runner paths committed without a test of their own (drag, held drag, dwell, marquee, typing): the first feature
  that uses each path proves it by switching that step off in the runner and showing its scenarios fail.
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
12. Under load, e2e timed out once on the File menu button "stable" and once on coordinates.spec.ts:181 (18–20 s in
    the full run, 4.9 s alone, limit 30 s; .cache/logs/e2e-layers-tree-012944.log); the reruns passed.
13. Insert's density labels overflow and overlap ("Two columns": 69 px text in a 50 px button).
14. sidebar.tsx writes the argument name "target" (the manifest's adapter.selection) and builds data-args apart.
15. shell.tsx keeps the fit zoom in useState; it moves to the store with the zoom commands.
18. A menu item run with Enter or a click (focus.activate) closes the menu through onDone, not a dismissal, so the
    focus still falls to the page body; the backdrop's focus return (ui.dismiss#overlay-backdrop) has no test.
19. Canvas chrome not built yet: label hidden under the pointer, size chip, quick panel, label as a hit target;
    `selection.select` throws on a node the document lacks (no refusal key).
20. Layers' folded branches are not cleared when File › Open loads another project (a same-id node starts folded).
22. Not built, no scenario: walking or inserting onto an off-screen element does not scroll it into view (the
    frame's scroll needs an owner, frame-owner rule); history.depth (80) is not enforced.
23. `src/manifest/check.ts` keeps its own htmlRefusal, a second content model beside src/core/elements/content-model.ts.
24. Escape on a focused palette tile is bound to focus.canvas (not built), so it does nothing yet.
25. A Layers row's Shift/Ctrl doors have no data-door of their own; the census counts them only through scenarios.
26. marquee: Escape during a band should cancel it (needs drag.cancel, not built); hidden and locked nodes are not
    left out (the model has no flags yet; status.selection.skipped unused); a lost pointer restores it, untested.
