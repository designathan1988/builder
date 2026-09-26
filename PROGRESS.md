# Progress

## Codex lane

- 2026-09-26: Worktree `builder-codex`, branch `codex`; first commit `4a49cc1` adds the lane instructions.
- 7.1 baseline reproduced in the in-app browser from 92bb39b: flat Settings, blank Button type, invalid attributes/values, stale link data, class target, Label/Select, inline text and missing fields. Evidence: `.cache/logs/uso-7.1-20260926-1459/antes/`.
- 7.1a current app: General/Link/Attributes for a link and `submit` default on a button in Desktop/Phone at 100%/Fit; undo/redo, reload and adjacent drag checked, zero console errors. Evidence: `.cache/logs/uso-7.1a-20260926-1519/`.
- Previous Settings layout: one flat attribute list; new layout: manifest-driven General, Link, Image, Accessibility, SEO and Attributes sections.
- 7.1a delivered as `5343759` on origin/codex: `settings-organized.spec.ts` and its UI tooth passed, plus 32+36 nearby scenarios and four-combination real use; logs in `.cache/logs/`. The class-registry write was deferred to 7.1c so the old Classes scenario stays green.
- 7.1b spec correction: page-properties P3 formerly accepted any language-shaped tag; now a known BCP 47 language or valid private-use tag is required, so `banana` is refused beside Page language.
- 7.1b verified: type-specific refusals and local errors, type-switch loss warning, native date/colour/range controls; 6 focused browser tests, 9 existing scenarios, 16 unit tests and three direct document-diff teeth passed. In-app browser Desktop 100%/Phone Fit, undo/redo/reload/Preview, ZIP and file URL render, console 0: `.cache/logs/uso-7.1b-20260926-1622/`. Broad `npm run check` is deferred to the block-end suite by the user's latest order.

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-26, /goal "todas as funcionalidades", blocks in the user's order)

- Work in .cache/wt/integration (branch integration), saved after every feature: commit + push origin integration.
- Groups 01-12 pass with teeth (docs/history.md) but: multi-select-actions (needs keyboard-panel-navigation and
  panel-resize), nesting-grammar-structure (36), layers-row-colours (no label colour
  tokens), hover-measure (46). Not built: Alt+drag duplicates, a line outside the stage refused.
- Last check (12): 1333 passed, 9 failed (findings since decided). Group 13: dock-toggles, workbench-panel,
  command-bar built. Now: audit blocks 1-9 (.memory/audit-checklist.md); full checks wait for each block's end.

## Decisions (small ambiguities and the user's corrections)

- Older decisions (custom CSS, surgical pointing, zoom 100, guides named axis-n, the shortcut rule): docs/history.md.
- Quick panel side, SVG naming, swatches, field Reset tab order, export blank lines, class target: docs/history.md.
- Panel header Close: in each sidebar view's title (the inspector: Ctrl+Alt+B, View). More: docs/history.md.
- Command bar: an entry runs, then the bar closes; a file/clipboard command is offered by its predicate (appliesNow);
  Space types in any text field, a field naming its own context too; tests open the bar from the Commands field.

## Audit prompt: documentation changed (item, before -> after)

- Block 1 (1.1-1.6) documentation changes: docs/history.md (2026-09-26 entries).
- A items of block 1 (A1.1, A3.41, A3.32, A3.23, A3.38): docs/history.md (2026-09-26, moved). A3.10 spec
  provenance-reset P6: origin note per field (class muted, others in legend colour) + "Typing writes to X · layer".

## Open findings

1. A node path names no page nor two same-named siblings. 5. canvas.tsx RULER_STEP = 200 is a constant in code. 6. panels.spec.ts, doors.spec.ts run doors without `runs()`.
9. inspector-fields.spec.ts: wrong `drawnAs` data passes. 11. Renderer: textarea/option line break becomes `<br>`.
12. Flaky under load: coordinates:181, a 'stable' File menu. (Hysteresis fixed: a handle's dot took presses inside.)
15. shell.tsx keeps the fit zoom in useState. 14. sidebar.tsx writes the argument name "target" and builds data-args.
18. Backdrop focus return untested. 19. No size chip; label not a hit target. 20. Layers folds survive File › Open.
22. Walking onto an off-screen element does not scroll it; history.depth (80).
24. Escape on a palette tile: focus.canvas (not built). 25. Layers Shift/Ctrl doors lack data-door. 27. M: no lock refusal.
26. marquee: Escape should cancel a band; hidden and locked nodes are not left out (audit 3.7).
28. Move up/down enabled at an edge. 31. Escape keeps a rename. 33. New Summary empty. 23. check.ts htmlRefusal twice.
32. With nothing selected the inspector draws its sections.
30. Declared, not built: wrap refusals formInForm, labelOneControl; drop.emptyAimMin; the hover label as a hit target.
34/37. palette-density, layers-drag dwell: spec-test teeth only. 36. nesting-grammar-structure vs hand unit test.
35. The tooth proof also switches off a scenario's setup doors' commands. (43 property-search: done, audit 1.2.)
42. Quick panel: no F6 in nor Escape out; chip and fields are Tab stops (audit 6.3). 46. hover-measure: no door.
48. Enter/Space on a toolbar button do nothing until keyboard-panel-navigation (group 14) binds focus.activate.
51. census.spec (78) near its 120 s limit: over it in check-a341-a332-152653 (4 workers + CODEX Chrome), 96 s alone
    with 2 workers (census-154024); alone with default workers 3/3 pass at 90 s (census-default-1..3). Fails only
    under a full check's load: the state walk grows with the doors; cause to fix (faster walk), never the limit.
50. e2e:tooth: workbench-panel's fold scenario ends in the start state (targeted tooth: toggle only opens);
    command-bar fails 52 in setup (finding 35): teeth by commandBar.open off and offers off (tooth-bar-* logs).
52. OPEN FAILURE (codex 7.1, a2e1689): shared-style-classes.spec:69 reads "2 elements", the name now an input (a310-light-*).
