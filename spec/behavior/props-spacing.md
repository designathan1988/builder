# props-spacing — Margin and padding in the box model editor

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- The inspector's **Space** section (collapsed at first, its header summarising `P 56px 40px` for a fresh Section): the box model editor `ppSpacing` (`src/features/inspector/properties.js:1211-1325`). A diagram draws the margin around the padding around the content size (`w × h`, read from the frame, `:1226-1238`); beside it, one group per box (Margin, Padding), each with a unit menu, a **Link sides** toggle (`inspector.linkSides`, `:1280-1290`) and four number fields Top, Right, Bottom, Left (`:1294-1318`), placeholder `0`, no scrub glyph.
- Keys in a side field are those of every number field (inspector-number-fields).

## Result

- A side field writes its own longhand (`padding-top`…) with the typed number and the box's unit (`:1300-1304`).
- While **Link sides** is on, a change in any side field writes the same value to all four sides (`:1302`).
- Turning **Link sides** on copies the Top value into Right, Bottom and Left at once (`:1283-1288`), a document change made by a view toggle. The toggle's state is kept per box in a memory shared by every element (`ppCursor("spacing:" + kind)`, `:1281`, `PP_CURSOR`, `:1338-1340`) and lost on reload.
- The unit menu converts all four sides to the chosen unit (`:1262-1278`); `auto` is offered for margins only (`:1259`).
- Nothing bounds the fields: a negative padding is written like any value, and the browser drops it (a negative padding is invalid CSS), so the element keeps its previous padding without a word. A negative margin works.
- Text that is not a value is put back silently (the number field's rule, spec inspector-number-fields).

## Visual feedback

| Stage | What is drawn |
|---|---|
| Section open | The diagram with the content size in its core, the two groups with their four fields; hovering or focusing a field lights its side in the diagram (`:1308-1312`). |
| After a change | The field shows the new value; the canvas redraws the element. The status bar says nothing. |
| Link sides on | The link button pressed; three sides jump to the Top value. |

## Undo and redo

Each side change is one undo step. Turning Link sides on, which rewrites three sides, is one undo step too, though it looks like a view option.

## Keyboard equivalent

Tab moves between the side fields; the number field keys apply (inspector-number-fields).

## Problems in Pager

1. **Turning Link sides on rewrites three sides** from the Top value: a view toggle that silently changes the document. Required: `inspector.toggleSpacingLink` changes only how the box is edited and writes nothing (no undo step); the status bar says the box is linked or unlinked (`status.spacing.linked`, `status.spacing.unlinked`). While a box is linked, its four side fields are replaced by one field for the four sides (the box's composite door), holding the value when the four agree and empty otherwise; keeping a value there writes the four longhands (`style.setSpacing` with `sides: all`) as one undo step. Unlinked, each side field writes its own longhand.
2. **The link's state lives in a memory lost on reload** and shared silently. Required: the link state of each box is an editor preference: the same for every element, and kept after a reload.
3. **A negative padding is accepted and then dropped by the browser**, so nothing happens and nothing says why. Required: a negative padding is refused with `status.value.negativePadding` and the document keeps its value; a negative margin is accepted and drawn.
4. **Invalid text is put back without a word.** Required: text that is not a length, a percentage or (for a margin) `auto` is refused with `status.value.invalid` naming the property and the text; the document keeps its value.
5. **Nothing says what changed.** Required: every kept value is reported by the status bar with the property's label, the element's name and the value (`status.spacing.set`, e.g. `Padding top of Hero: 32px.`); a typed unit is kept as typed (`2rem`), a bare number takes px.
6. **A locked element's spacing can be changed** (Pager has no lock on this path). Required: a locked element, or one inside a locked element, refuses with `status.locked.edit` (spec lock-element) and keeps its values.
