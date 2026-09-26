# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-26, /goal "todas as funcionalidades", blocks in the user's order)

- Work in .cache/wt/integration (branch integration), saved after every feature: commit + push origin integration.
- Groups 01-12 pass with teeth (docs/history.md) but: multi-select-actions (needs keyboard-panel-navigation and
  panel-resize), nesting-grammar-structure (36), layers-row-colours (no label colour
  tokens), hover-measure (46). Not built: Alt+drag duplicates, a line outside the stage refused.
- Last check (12): 1333 passed, 9 failed (findings since decided). Group 13: dock-toggles, workbench-panel,
  command-bar built. Next: the user's audit prompt, blocks 1-9 (.memory/audit-checklist.md), then group 13 on.

## Decisions (small ambiguities and the user's corrections)

- Older decisions (custom CSS, surgical pointing, zoom 100, guides named axis-n, the shortcut rule): docs/history.md.
- Quick panel side, SVG naming, swatches, field Reset tab order, export blank lines, class target: docs/history.md.
- Panel header Close: in each sidebar view's title (the inspector: Ctrl+Alt+B, View). More: docs/history.md.
- Command bar: an entry runs, then the bar closes; a file/clipboard command is offered by its predicate (appliesNow);
  Space types in any text field, a field naming its own context too; tests open the bar from the Commands field.

## Audit prompt: documentation changed (item, before -> after)

- 1.1 DESIGN Style tab: "a field never shows a blank: it shows the effective value" -> the document's value as written;
  none there: empty, the effective value as its muted placeholder, nothing zoom-dependent. Spec provenance-reset: + P4.
- 1.2 DESIGN Style 4 "Property search ... reveals" -> Find a property filters; row "3 search result" -> "3 Add a property's item".
- 1.3 text-shadow effects/shadow -> text/typography; DESIGN "Text" -> "Text (with the text shadow)", + Add a property rule.
- 1.4 DESIGN Build order + "a disabled control is drawn clearly disabled; the quick panel leaves out an action that
  cannot act; a field draws its Reset only while there is a value"; specs quick-panel P8, provenance-reset P5.
- 1.4 decision: Canvas/Split/Code stay drawn, clearly disabled, none pressed (an unbuilt door never stands for a
  state: ARCHITECTURE Door rendering, current-state.spec); Canvas shows pressed once code-panel-view (group 17) is built.

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
50. e2e:tooth: workbench-panel's fold scenario ends in the start state (targeted tooth: toggle only opens);
    command-bar fails 52 in setup (finding 35): teeth by commandBar.open off and offers off (tooth-bar-* logs).
