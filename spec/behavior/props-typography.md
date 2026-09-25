# props-typography — Font, size, weight, style, spacing, alignment and the other text properties

How Pager behaves, read from its source. Source references are `path:line` inside Pager.

## Trigger

- The inspector's **Text** section (collapsed at first on a Section, open on a text element: `homeSection`, `src/features/inspector/properties.js:279-284`; its header summarises `font-size · font-weight`, `:350`). Its rows, in order (`:2533-2536`): Font, Size, Weight, Style, Line height, Letter spacing, Word spacing, Align, Colour, Decoration, Case, Indent, Text overflow, White space, Word break, Vertical align. Each row applies where the catalogue says (`src/features/inspector/catalogue.js:352-369`): every element that can hold text, text overflow only on a clipping box (`:365`), vertical align only on an inline, inline-block or table-cell element (`:368-369`).
- Each property has its editor (`properties.js:2358-2375`, drawn by `ppEditor`, `:3245-3404`):
  - **Font**: a button that opens a popover listing six families, each drawn in its own face with a sample, and a "Custom" text field under the list (`ppFontPicker`, `:2108-2147`; the list `PP_FAMILIES`, `:2100-2107`).
  - **Size, Letter spacing, Word spacing, Indent**: the number field with a unit menu (`dimension`, `:3270-3279`; units `px rem em %` for Size and Indent, `em px rem` for the spacings, `:2360`, `:2364-2365`, `:2371`).
  - **Weight**: a button that opens a popover of the nine numbered weights, each drawn in its weight with its name, "Thin" … "Black" (`ppWeightPicker`, `:2150-2181`; names `src/core/i18n.js:2606-2614`).
  - **Line height**: a plain text field, placeholder `1.5` (`text`, `properties.js:2363`; `catalogue.js:358`).
  - **Align**: six icon buttons, left, center, right, justify, start, end (`ppSegmented`, `properties.js:2366-2367`, `:1070-1101`).
  - **Style, Case, Decoration, Text overflow, White space, Word break, Vertical align**: a closed set (`ppClosedSet`, `:3430-3438`): icon buttons when every value has an icon and there are six or fewer, text buttons when they fit, otherwise a button that opens a menu (`ppSelect`, `:1019-1051`). The values are the catalogue's short lists (`catalogue.js:356-369`).
- Keys: the number field's keys in the length fields (inspector-number-fields); in a menu button ArrowDown and ArrowUp pick the next or previous value at once (`properties.js:1036-1042`).

## Result

- Every editor writes its property through `setProp` → `setProps` (`catalogue.js:668-707`, `:716-718`): the value is refused when it is not in the property's short list (`:690`) or when the style schema does not accept it (`:691`); the same value writes nothing (`:699`); otherwise one inspector transaction writes it to the node, in the current breakpoint and state (`writeProp`, `:645-658`).
- A number field writes the typed number with the chosen unit (`properties.js:3278`); Line height writes the text as typed (the default text field, `:3402-3403`); the Font's Custom field writes whatever it holds (`:2138-2139`).
- **Decoration** is stored whole as the `text-decoration` shorthand (`catalogue.js:362`), and **White space** as the `white-space` shorthand (`:366`).
- The Weight popover offers only the numbered weights (`ppWeights` keeps the values above 0, `properties.js:2148`): `normal`, `bold`, `lighter` and `bolder`, which the catalogue lists, cannot be chosen.
- The Font list mixes stacks the page never loads (`'Sora'`, `Inter`, `'JetBrains Mono'`, `properties.js:2102-2103`, `:2105`): choosing one draws the page in whatever fallback the browser finds.
- A refused value shows a toast, "{prop} would not take "{value}" — the export refuses declarations CSS cannot parse…" (`properties.js:2667-2680`, `src/core/i18n.js:688`), and the field repaints its old value.

## Visual feedback

| Stage | What is drawn |
|---|---|
| Section open | One row per property, its label with a small icon (`properties.js:3440-3447`); an unset field shows the value in force greyed, with the element it inherits from ("from Page"). |
| Font or Weight popover | Each family or weight drawn in itself, the current one marked `aria-selected`. |
| After a change | The field shows the new value; the canvas redraws the element. The status bar says nothing. |
| Refused value | A toast with the refusal; the field shows its previous value. |

## Undo and redo

Each kept value is one undo step (`catalogue.js:700-706`). A menu browsed with ArrowDown writes one undo step per key press.

## Keyboard equivalent

Tab moves between the fields; Enter keeps a typed value; the number field keys apply in the length fields (inspector-number-fields); ArrowDown and ArrowUp in a closed menu pick the neighbouring value.

## Problems in Pager

1. **The short lists shut values out.** A weight of 450, `text-align: match-parent`, `text-transform: full-width` or a vertical align of `4px` cannot be written: `setProps` refuses anything outside the catalogue's short list (`catalogue.js:690`), and the Weight popover hides even the weight keywords. Required: every text field is one `style.set` door per property (the manifest's `style.set#inspector-*` doors of this feature); in All properties its list offers every value the generated browser data allows plus the presets the manifest declares for it (the font stacks, the named weights 100 to 900 with their names), Essentials only offers the declared subset and never a value All properties lacks, and any value the property takes can also be typed into the field and kept with Enter, a keyword menu included.
2. **The font list offers faces the page never loads**, so the page silently shows a fallback. Required: the font menu lists the system and web-safe stacks of the manifest (`font-family` subset `stacks`), each ending in its generic family; another family can be typed.
3. **Decoration and White space are stored as shorthands** the browsers expand differently from the fields that read them. Required: Decoration is the `text-decoration` composite and White space the `white-space` composite: keeping a value writes every longhand of the composite in one command and one undo step (`text-decoration-line`, `-thickness`, `-style`, `-color`; `white-space-collapse` and `text-wrap-mode`), a longhand the typed value does not name taking its initial value (`underline dotted` writes `underline`, `auto`, `dotted`, `currentcolor`; `nowrap` writes `collapse` and `nowrap`); the document never stores the shorthand.
4. **Line height is free text that cannot say what a bare number means.** Required: a bare number kept in Line height stays a unitless multiplier (`1.5`, drawn as 1.5 times the font size); in every length field a bare number takes px (`18` → `18px`) and a typed unit is kept as typed (`1.25rem`).
5. **Refusals are a toast about the export, and they hide the element and the text.** Required: text the property does not take (`abc` in Size, `1200` in Weight, a white space that is not a keyword) is refused with `status.value.invalid` naming the property's label and the typed text; the document keeps its value and nothing is recorded.
6. **Nothing says what changed.** Required: every kept value is reported by the status bar with the property's label, the element's name and the value as stored (`status.style.set`, e.g. `Font size of Intro: 18px.`). Keeping the value the element already has records nothing.
7. **A locked element's text properties change** (the refusal Pager gives names a move, `src/core/i18n.js:1773`). Required: a locked element, or one inside a locked element, refuses with `status.locked.edit` (spec lock-element) and keeps its values.
8. **Where a property does not apply, its row still stands in the list or vanishes without a word.** Required: a property's field is drawn where its `appliesTo` predicate holds (text overflow on a box that clips its overflow, vertical align on an inline element or a table cell); once the element qualifies (its overflow set to `hidden`, its display set to `inline`) the field is drawn and writes like the others.
