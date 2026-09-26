# inspector-advanced-mode — Essentials only or all properties

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Paragraph.

## Trigger

- The inspector's foot holds one button that switches between **Essentials** and **Advanced** (`ppFoot`, `src/features/inspector/properties.js:3469-3474`).
- Essentials (`ppMode = "relevant"`, the default, `:2616`) shows the properties of `PP_ESSENTIAL` (`:2629-2634`: display, flex and grid basics, position, spacing, width, height, object fit, background, border, font family, size, weight, line height, letter spacing, text align, colour, opacity, box shadow), the ones added through the picker, the pinned ones and those with a value set on the element (`ppEssential`, `:2636-2637`).

## Hit zones and thresholds

Not applicable: the control is a button of the inspector.

## Visual feedback

The Style tab draws its sections again with the fields the mode shows.

## Result in the document

Nothing: the mode only changes what the inspector draws.

## Undo and redo

Not recorded.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

The button is keyboard-operable.

## Problems in Pager

1. **The mode is forgotten on every selection** (`if (!sameNode) { … ppMode = "relevant" … }`, `:2750`) and after a reload. Required: the chosen mode is an editor preference, kept across selections and reloads; a fresh profile shows every property (All properties is the default).
2. **One button whose label is the other mode** (`t(ppMode==='all'?'workspace.essentials':'workspace.advanced')`, `:3472`), so it never says which mode is on. Required: two segments, Essentials only and All properties, the current one pressed.
