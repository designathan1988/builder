# copy-paste-styles — Copy and paste styles between elements

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no copy-style or paste-style command.** The i18n catalogue holds the labels (`command.copyStyle` "Copy style", `selbar.action.copystyle`, `src/core/i18n.js:2277`, `:328`), but no command, menu row or key uses them. `Ctrl+Alt+C` and `Ctrl+Alt+V` are not bound (they are not in `KEYMAP`, `src/features/input/index.js:660-833`, or in any command chord).

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

None in Pager.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **Styles cannot be copied from one element to another.** Required (features.json `copy-paste-styles`):
   - Ctrl+Alt+C (Copy style) puts every style value of the selected element on the system clipboard in the app format.
   - Ctrl+Alt+V (Paste style) replaces the target's style values with the copied ones as one undo step; text, children and attributes stay.
   - Both commands are in the context menu and the Edit menu with their shortcuts.
