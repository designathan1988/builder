# inspector-provenance-reset — Mark set values and reset one property or all of them

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Paragraph with padding, colour and font size set.

## Trigger

- Each field row carries a provenance chip saying where its value comes from (`chip.dataset.provenance`, `src/features/inspector/properties.js:3078-3110`: the element itself, a class, inherited, the default); its menu can clear the value.
- The element actions menu holds **Reset all** (`{label:t('inspector.resetAll'),onRun:()=>clearAllProps()}`, `:2814`).

## Hit zones and thresholds

Not applicable: the controls are buttons and menu items.

## Visual feedback

A value set on the element is marked by its chip; a cleared field shows the value inherited or the default.

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
