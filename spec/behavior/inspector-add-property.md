# inspector-add-property — Add a property that is not shown yet

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container in the essentials mode.

## Trigger

- The **+** button of the inspector's header (`ppIconButton({glyph:'plus', … label:t('inspector.addProperty') …})`, `src/features/inspector/properties.js:2807`) opens the property picker (`ppOpenPicker`, `:2638`; `propertyPickerOpen`, `:655-700`).
- The picker lists the properties not drawn now, grouped by section, each with its label and CSS name (`:686-692`), filtered by what is typed in its field (`propertyPickerMatches`, `:673`), at most 40 (`:673`); `None` when nothing matches (`:675`).
- Choosing one closes the picker and adds the property to the fields drawn (`ppAdded`, `:2636`), which reveals it (`ppReveal`, `:3475`).

## Hit zones and thresholds

Not applicable: the picker is a list of buttons.

## Visual feedback

The field appears in its section, and takes the focus.

## Result in the document

Nothing until a value is typed in the field.

## Undo and redo

Choosing a property is not recorded.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

The picker's field keeps the focus: typing filters, arrows move the marked item, Enter chooses it.

## Problems in Pager

1. **An added property is forgotten on the next selection** (`ppAdded.clear()`, `:2750`). Required: the property just added stays drawn until another is added or it holds a value (a property with a value is always drawn).
2. **Choosing a property is no command:** nothing else (the command bar) can reveal a field the same way. Required: choosing one runs `inspector.reveal`, the one command that shows a field and gives it the focus.
3. **The list's filter did not take the focus, and a property chosen showed nothing** (the user's real-use audit, item 1.3: the text typed after "+" went to Padding top; choosing "Text shadow · text-shadow" added no field). Required: opening the list gives its filter the focus; Enter there chooses the first property listed; the list offers only the properties that apply to the selection and that the tab does not draw yet; the property chosen is drawn in its section and its field takes the focus (the text shadow: its text field, shadow-editor Problems in Pager 4).
4. **The list could not be closed like the other menus** (found in the block 1 real-use pass: Escape in its filter left it open, so the next press elsewhere only closed it). Required: the list is closed as every menu is (DESIGN.md "Overlays"): Escape (`ui.dismiss`) and a press outside it (the overlay backdrop) close it, and the focus goes back to the **+** button. Its filter is a combobox in the `menu` key context, as the command bar's field is: the focus stays in it while the arrows move the marked property (the first one listed is marked as the list changes) and Enter chooses the marked one (`focus.activate`), which is what "Keyboard equivalent" above asks.
