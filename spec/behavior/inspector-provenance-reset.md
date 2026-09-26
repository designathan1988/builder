# inspector-provenance-reset — Mark set values and reset one property or all of them

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Paragraph with padding, colour and font size set.

## Trigger

- Each field row carries a provenance chip saying where its value comes from (`chip.dataset.provenance`, `src/features/inspector/properties.js:3078-3110`: the element itself, a class, inherited, the default); its menu can clear the value.
- The element actions menu holds **Reset all** (`{label:t('inspector.resetAll'),onRun:()=>clearAllProps()}`, `:2814`).

## Hit zones and thresholds

Not applicable: the controls are buttons and menu items.

## Visual feedback

A value set on the element is marked by its chip; a cleared field is empty and its muted placeholder shows the value inherited or the default (Problems in Pager 4).

## Result in the document

- Clearing a value removes the property from the element's styles.
- Reset all removes every style value of the element.
- The computed values in the iframe fall back to what the element inherits or its defaults.

## Undo and redo

Each clearing is one undo step; Reset all is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

The chip's menu and the element actions menu are keyboard-operable.

## Problems in Pager

1. **Where a value comes from is shown per row only:** a collapsed section tells nothing about the values set inside it. Required: every field whose element holds a value of its own shows a dot, and each section's header shows how many values are set in it, as a badge beside its summary; the summary text is unchanged.
2. **Clearing a value takes the chip's menu:** there is no reset control on the field itself. Required: each field has Reset this value (`style.reset`), usable while the element holds a value of its own; the field then shows the value inherited or the default, muted.
3. **Reset all has no command:** it cannot be reached from the keyboard map or the command bar. Required: Reset every value is `style.resetAll`, in the element actions menu, one undo step, refused on a locked element.
4. **Fields showed what the page computes as if it were the element's value** (the user's real-use audit, item 1.1): `Font "Times New Roman"`, `rgb(0, 0, 0)`, `rgba(0, 0, 0, 0)` in fields the element never set, and `Border 1.7561px…` on an element with no border (Chrome's typed computed value of `medium`, scaled by the canvas zoom: 2.85366px in Phone at 210 %), with the Border handles' chips reading `1.76`. Required, in the Style tab and the quick panel alike:
   - a field's value is the value the document holds for the element at the edited target, breakpoint and state, as written: a composite shows its shorthand (`2px solid #00aa00`, never its twelve longhands); a border side with no style reads `none`;
   - with no value there, the field is empty and its placeholder, muted, shows the effective value: the one the document gives along the cascade (another breakpoint or state), else what the page computes (inherited or the default);
   - nothing a field or a handle's chip shows depends on the canvas zoom: a border or outline side whose style is `none` or `hidden` computes to `0px`, and any other side's width is read unscaled by the zoom.
