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
- Speed: Playwright waits 5 s per action and expect; verify:fast runs its steps in parallel (33.6 s → 20.4 s); the
  census uses a fresh context per state, skips states already read, visits six at once (71.6 s → 15.1 s); the whole
  e2e takes about 32 s.
- Next: slice 1 item 4, one conversation per feature, in this order: select-click; palette-click-insert with
  undo-redo (one commit); layers-tree; delete-element. Each passes all its scenarios through every door, with
  `npm run e2e:tooth` and the census green.
- Work in progress for select-click, not committed, kept in `.cache/scratch/4a/` (whole files and diffs made
  before items 3's later commits; reapply by point edits, the keymap has changed since): selection.ts (select,
  clear, hasSelection), the canvas chrome (selection outline and label by the label rule, hover outline),
  coordinates `contentBoxes`, the keymap's body = canvas context and shortcut arguments from the focused control's
  `data-args`, references.json entries.
- Plans for item 4 recorded in docs/history.md (slice 1): tiles enabled only when their entry's feature has every
  command built (FEATURE_COMMANDS); select on press; the census will ask a test for every reachable door.

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
16. playwright.config.ts `testIgnore` '**/.cache/**' finds no test when the repository path contains `.cache`.
17. After Escape closes a menu the focus rests on the page body, not on the menu's button (the menu has no key
    listener of its own now).
