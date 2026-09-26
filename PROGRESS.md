# Progress

At most 60 lines: state, the user's pending decisions, open findings. History and proofs: `docs/history.md`.

## State (2026-09-26, /goal "todas as funcionalidades", blocks in the user's order)

- Order (the user's): palette, Layers, drag and drop, canvas, style, export, the rest; one suite per block. Work staged
  in .cache/wt/integration (branch integration); the commit guard judges the main folder: the commit is the user's.
- Group 11 done: breakpoints-switch, breakpoint-overrides, state-styles (a menu opened from a button now opens at fixed
  window coordinates, above its button when there is no room below: the inspector's overflow cut the State menu).
- Groups 01-11 pass with teeth (docs/history.md) but: multi-select-actions (needs keyboard-panel-navigation and
  panel-resize), inspector-property-search (43), nesting-grammar-structure (36), layers-row-colours (no label colour
  tokens), hover-measure (46). Not built: Alt+drag duplicates, a line outside the stage refused.
- Last check (03): check-group03-091000.log (static green, 1298 passed, 9 = findings and a runner race, fixed).

## Decisions (small ambiguities and the user's corrections)

- Older decisions (custom CSS, surgical pointing, zoom 100, guides named axis-n, the shortcut rule): docs/history.md.
- Quick panel: its chip sits beside the selection's label (DESIGN "Canvas"), so it covers no more than the label;
  the open panel goes to the side with the most free space. SVG: the element's name is "SVG" (a "/" broke node paths);
  its viewBox is its px size; shapes keep geometry attributes (elements.json). Saved colours live in the document
  (`swatches`, diff path "/@swatches"), recent ones in the preferences; saving joins the picker's session.
- A field's Reset leaves the Tab order while there is nothing to reset. plants.ts: door-writes-shorthand's door runs in a
  quick-panel scenario. Scenarios name no vendor-prefixed property (spec tests prove a recipe's).
- Export stylesheet: a blank line parts every rule, the :root and class blocks too. A class target returns to Element
  on a new selection; a field of a kind (list, table, form, media) shows only while every selected element is of it.
- Dialogs, snap targets, smart guides, corrected-before-commit scenarios: docs/history.md (2026-09-26 decisions).

## Open findings

1. A node path cannot name a page itself nor tell apart two siblings with the same name.
5. canvas.tsx RULER_STEP = 200 is a constant in code. 6. panels.spec.ts, doors.spec.ts run doors without `runs()`.
9. inspector-fields.spec.ts: wrong `drawnAs` data passes. 11. Renderer: textarea/option line break becomes `<br>`.
12. Flaky under load: coordinates:181, a 'stable' File menu; drag-reorder-canvas hysteresis (once, then 5 of 5).
15. shell.tsx keeps the fit zoom in useState. 14. sidebar.tsx writes the argument name "target" and builds data-args.
18. The backdrop's focus return is untested. 19. Canvas chrome not built: size chip, label as hit target. 20. Layers'
folds survive File › Open. 22. Walking onto an off-screen element does not scroll it; history.depth (80).
24. Escape on a focused palette tile is bound to focus.canvas (not built). 25. Layers Shift/Ctrl doors lack data-door.
26. marquee: Escape should cancel a band; hidden and locked nodes are not left out. 27. M does not refuse a lock.
28. Arrange › Move up/down enabled at an edge. 31. Escape does not cancel a rename. 33. A new Summary is empty.
23. check.ts keeps its own htmlRefusal beside content-model.ts. 32. With nothing selected the inspector draws its sections.
30. Declared, not built: wrap refusals formInForm, labelOneControl; drop.emptyAimMin; the hover label as a hit target.
34/37. palette-density, layers-drag dwell: spec-test teeth only. 36. nesting-grammar-structure vs hand unit test.
35. Tool audit (awaiting OK): the tooth proof also switches off a scenario's action doors' commands.
39. USER DECISION: current-state.spec.ts expects more than 100 drawn doors of unbuilt commands; 66 are left.
40. USER DECISION: menu, context-menu and toolbar doors of an unregistered feature whose command is built are enabled
    (31 features); applying the door rule to them disables them until each gets scenarios.
41. USER DECISION: palette-tiles.spec.ts needs a palette entry of an unbuilt feature to prove the gate; with SVG built
    every entry's feature is built, so both its tests stop ("no tile is left"). The census still proves the gate.
42. Quick panel: no F6 in nor Escape out (no door); its chip and fields are Tab stops. 43. property-search: no door.
44. USER DECISION: waiting-panels.spec.ts x2 wants New variable "not available yet"; css-variables-tokens built it.
45. USER DECISION: props-position › the-absolute- and the-fixed-button-sets-the-position expect the mode alone;
    absolute-free-drag's couplings (a static parent becomes relative, top/left keep the place) now also write them.
46. hover-measure: no door or region, so no scenario; built, proven by its spec test, not registered (census).
49. USER DECISION: check.test planted fixture state-door-on-canvas-toolbar expects state-placement alone; since state-styles
    has scenarios, door-coverage also reports its planted door (a door of state-styles no scenario runs).
48. Enter and Space on a toolbar button (top bar, canvas toolbar) do nothing: the toolbar key context binds them to
    focus.activate of keyboard-panel-navigation (group 14, not built). Fixed when group 14 is built.
47. USER DECISION: context-menu › the-menu-runs-from-the-keyboard presses End then Enter to delete Intro; DESIGN keeps
    items in the features' order, so reusable-components' Create component (order 25) now comes after Delete.
