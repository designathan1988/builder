# Progress

At most 60 lines: the state now, the user's pending decisions, the open findings. The history, with every proof and
log path, is `docs/history.md` (not read at the start of a conversation).

## State (2026-09-25, after slice 1 items 1–3 and the user's speed changes)

- Built and passing: group 01 (editor-shell, canvas-page-iframe). Foundation done: the runner (setup and steps through
  doors, an undrawn canvas fails an assertion), pointer.ts (gesture machine, store.gesture() opened by the press),
  the menu doors (focus.next/previous/first/last/activate, ui.dismiss with its backdrop), the shortcut rule
  (`src/editor/input/shortcut-rule.ts`: a shortcut runs when its command is built and its feature introduces the
  command or has all its commands built; keymap, census and runner share it), lint rules pointer-owner,
  gesture-owner, frame-owner, keyboard-owner, no-manifest-id.
- Now: group 02 brief (user, 2026-09-25): a coordinator opens up to 3 helpers at once, each in a git worktree
  `.cache/wt/<feature>` (branch feature/<feature>, node_modules junction, own E2E_PORT/TOOTH_PORT), and integrates
  one at a time after verify:fast, e2e with the census, e2e:tooth and the status. Done: findings 16 and 17.
- Group 02 passing: select-click (runner paths "setup selection" and "canvas click" proven), layers-tree,
  keyboard-tree-walk (with the editor-only 40 px minimum height of an empty container, canvas.emptyContainerMinHeight,
  that its setup needs; the runner's refusal check takes the message's names from the scenario's expected message).
- Decisions (small ambiguity): the brief's order wins over select-click's dependsOn; the tooth switch also holds the
  feature's predicates true (a refusal made by a predicate goes with its feature); a drawn door follows its command
  (selection.select#layers-row, selection.clear#menu-edit work, each tested); selecting inside a folded branch
  unfolds it in layers-tree (its scenario asks it; the spec put it under layers-expand-collapse-all).

## Conditions the user set

- Runner paths committed without a test of their own (setup selection by canvas click, drag, held drag, dwell,
  marquee, typing): the first feature that uses each path proves it by switching that step off in the runner and
  showing its scenarios fail.
- Open finding 11's parts are fixed before the feature that needs them: a `}` in a style value before
  inspector-number-fields; a link's newTab as `target="_blank"` with `rel="noopener"` before elements-structure; a
  line break in textarea and option before elements-form-structure.

## Pending decisions of the user

- none.

## Open findings

1. A node path cannot name a page itself nor tell apart two siblings with the same name (blocks no scenario yet).
5. `src/editor/shell/canvas.tsx` RULER_STEP = 200 is a constant in code; no rule names the ruler marks.
6. `tests/e2e/panels.spec.ts` and `doors.spec.ts` run doors their own way and do not name them with `runs()`.
7. `door.ts` once named the census before it existed (comment fixed; kept for the record of 6).
9. inspector-fields.spec.ts checks the drawing follows the data, so wrong `drawnAs` data passes.
11. The renderer: newTab renders `target=""`; a line break in textarea/option becomes `<br>`; a `}` in a style value
    could break out of its node's rules (tied to features above).
12. One e2e run timed out on the File menu button being "stable" under load; the rerun passed.
13. Insert's density labels overflow and overlap ("Two columns": 69 px text in a 50 px button).
14. sidebar.tsx writes the argument name "target" (the manifest gives it in adapter.selection) and builds data-args
    apart from DoorControl.
15. shell.tsx keeps the fit zoom in useState; it moves to the store with the zoom commands.
18. A menu item run with Enter or a click (focus.activate) closes the menu through onDone, not a dismissal, so the
    focus still falls to the page body; the backdrop's focus return (ui.dismiss#overlay-backdrop) has no test.
19. Canvas chrome not built yet (DESIGN.md/select-click spec): label hidden under the pointer, size chip, quick panel,
    label as a hit target; `selection.select` throws on a node the document lacks (no refusal key).
20. Layers' folded branches are not cleared when File › Open loads another project (a same-id node starts folded).
21. coordinates.spec.ts:181 takes 18–20 s in the full e2e (4.9 s alone), near the 30 s limit; it timed out once
    while helpers ran Chrome (.cache/logs/e2e-layers-tree-012944.log); the rerun passed.
22. keyboard-tree-walk spec: walking to an off-screen element scrolls it into view; no scenario, not built; the
    frame's scroll needs an owner (frame-owner rule). Walking at the page root is refused naming the page.
