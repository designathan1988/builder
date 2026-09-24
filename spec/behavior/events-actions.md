# events-actions — Events and actions per element

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no interactions.** Its i18n catalogue holds trigger and action labels (`interaction.trigger.click`, `interaction.trigger.pointerenter`…, `interaction.action.show`, `interaction.action.hide`, `interaction.action.toggle`, `src/core/i18n.js:179-186`, `:269-271`), but no code uses them: no inspector section, stored field or export writes an interaction. Elements have no events in Pager's document.

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

1. **Elements cannot react to events.** Required (manifest feature `events-actions`):
   - An Interactions section in the inspector adds, edits and removes interactions on the selected element.
   - Triggers are click, hover (enter and leave), scroll into view, page load and form submit.
   - Actions are show, hide, toggle class, play animation, scroll to and open link.
2. **Targets and validity.** Required:
   - Targets are picked from the page or Layers, never typed ids.
   - Combinations that cannot apply (form submit on a non-form) are not offered.
3. **Storage.** Required:
   - Interactions are stored per element in the document JSON; each add, edit and remove is one undo step.
   - The editing canvas never runs them; preview and the exported page run them once they are exported as JavaScript (manifest feature `export-events-js`).
