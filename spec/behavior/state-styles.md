# state-styles — Style states: hover, focus, active, disabled, invalid and placeholder shown

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager.

## Trigger

- Pager: a State control sets the state the inspector edits (`setEditState`, `src/features/workspace/camera.js:290-296`); the page is marked with the state (`paper.dataset.uistate`) so the canvas shows it, and a badge reads "Editing Hover" with the selector the values go to (`paintStateBadge`, `:279-289`). Values live per breakpoint and per state (`n.bpStates[bp][state]`, `src/model/style-layers.js:35`), written as `:hover` and so on in the CSS (`src/model/css.js:242`).

## Our rule

- The State menu (`view.setStyleState`) lists the states of properties.json: Base, Hover, Focus, Active, Disabled, Invalid, Placeholder shown; the chosen one checked.
- While a state other than Base is chosen, every style write goes to that state's layer, at the active breakpoint; the base values do not change. A canvas badge reads "Editing Hover" (`canvas.badge.editingState`), and the canvas draws the selected elements with that state's values applied, as if the state held.
- A field shows the value of the chosen state when it has one, else the base value (the origin "state" names where it comes from).
- The export writes each state's values under its pseudo-class (`:hover`, `:focus`…), inside the breakpoint's media query when the state value belongs to one; in the exported page, hovering the element changes its computed style.
- The chosen state is editor state: it goes back to Base at a reload, and records nothing.

## Refusals

As style.set's.

## Problems in Pager

1. **The chosen state is not shown on the canvas for the element alone:** the whole page is marked. Required: the selected elements drawn with the state applied.

## Undo and redo

Each write is one undo step; choosing a state records nothing.
