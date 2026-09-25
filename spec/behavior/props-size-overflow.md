# props-size-overflow — Min and max size, box sizing, aspect ratio and overflow

How Pager behaves, read from its source. Source references are `path:line` inside Pager. Width and Height are the fields of inspector-number-fields; this feature is the rest of the Size section and the overflow fields.

## Trigger

- The inspector's **Size** section (open at first, its header summarising `width × height`, `auto × auto` when neither is set: `src/features/inspector/properties.js:347`). Its rows (`:2528-2529`): Width, Height, Min width, Min height, Max width, Max height, Box sizing, Aspect ratio, then the media rows. Each applies to an element that is not `display: inline` (`hasBox`, `src/features/inspector/catalogue.js:154`, `:331-337`, `:348-351`).
- **Min width, Min height, Max width, Max height** are number fields with a unit menu (`dimension`, `properties.js:2337-2340`, drawn by `:3270-3279`). The units differ from row to row: Min width offers `ch`, Min height does not; Max width and Max height add `none` (`:2337-2340`); all four add `auto`, `min-content`, `max-content` and `fit-content` (`SIZE_KEYWORDS`, `:3272`; `src/model/values.js:44`).
- **Box sizing** is two icon buttons, content-box and border-box (`choice` with icons, `properties.js:2341`; `ppClosedSet`, `:3430-3434`).
- **Aspect ratio** is a plain text field, placeholder `16 / 9` (`properties.js:2342`; `catalogue.js:351`).
- **Overflow** lives in another section, Layout (`properties.js:2269`, `:2545`, `:2559`): an Overflow row of five icon buttons, visible, hidden, scroll, auto, clip (`:2425`), and, behind a disclosure on that row, Overflow X and Overflow Y with the same buttons (`detailOf`, `:268-273`; the disclosure `:3200-3213`; `:2426-2427`).

## Result

- Each row writes its own property through `setProp` (`catalogue.js:668-707`): refused when the style schema does not accept the value (`:691`) or, for the buttons, when it is not one of the short list (`:690`); the same value writes nothing (`:699`).
- **Overflow** is stored as the `overflow` shorthand beside `overflow-x` and `overflow-y` (three catalogue entries, `catalogue.js:348-350`): writing Overflow after Overflow X leaves both declarations in the node, and which one the page shows depends on the order the stylesheet writes them in.
- A negative size (`-10px`) is refused by the schema with the export toast (`properties.js:2667-2680`).
- The Size summary reads the declared width and height only (`properties.js:347`): an element sized by its content says `auto × auto`, and so does one whose width comes from a class or another breakpoint.

## Visual feedback

| Stage | What is drawn |
|---|---|
| Section open | One row per property; an unset field shows the value in force greyed. |
| After a change | The field shows the new value; the canvas redraws the element. The status bar says nothing. |
| Refused value | A toast with the refusal; the field shows its previous value. |

## Undo and redo

Each kept value is one undo step (`catalogue.js:700-706`).

## Keyboard equivalent

Tab moves between the fields; Enter keeps a typed value; the number field keys apply in the four size fields (inspector-number-fields).

## Problems in Pager

1. **Overflow is stored twice**, as the shorthand and as its longhands, so one element can hold contradicting values. Required: Overflow is the `overflow` composite: keeping a value writes `overflow-x` and `overflow-y` in one command and one undo step (`hidden` writes both `hidden`; `hidden scroll` writes `hidden` and `scroll`, the first value for X and the second for Y), and the document never stores `overflow`. Overflow X and Overflow Y each write their own longhand. The three fields sit in the Size section's overflow group (`properties.json`).
2. **The size fields offer different units for no reason.** Required: every size field offers the units and keywords the generated browser data allows for its property (All properties), a bare number takes px (`200` → `200px`) and a typed unit or keyword is kept as typed.
3. **Box sizing and the overflow fields accept only their short list.** Required: each keyword field offers every keyword the browsers support for its property and also takes a typed keyword kept with Enter (`border-box`, `clip`).
4. **Refusals are a toast about the export.** Required: a value the property does not take (a negative size, `wide` as an aspect ratio, `sideways` as an overflow) is refused with `status.value.invalid` naming the property's label and the typed text; the document keeps its value and nothing is recorded.
5. **Nothing says what changed.** Required: every kept value is reported by the status bar with the property's label, the element's name and the value as stored (`status.style.set`, e.g. `Min height of Actions: 200px.`).
6. **A locked element's size and overflow change.** Required: a locked element, or one inside a locked element, refuses with `status.locked.edit` (spec lock-element) and keeps its values.
7. **The values are only written, never shown to hold.** Required: what the fields write is what the page draws: a min width larger than the max width wins, a max height caps the content box (the padding added outside it) until Box sizing is `border-box`, and an aspect ratio gives an element with a width and no height the height the ratio asks.
8. **The Size summary reads only the declared values.** Required: the collapsed Size header summarises the width and the height the page computes for the element (`sections[].summary` of `properties.json`, spec inspector-panel), whatever sets them.
