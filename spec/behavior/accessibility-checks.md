# accessibility-checks — Accessibility and structure checks

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no checks panel.** Its i18n catalogue holds the texts of a "Design review" panel (`panel.aesthetics.title`, `src/core/i18n.js:571`) with rules such as colour contrast (`panel.aesthetics.rule.colorContrastText`, `:2469`), and an icon is registered for it (`src/platform/icons.js:183`), but no panel is registered (the only `registerPanel` calls are `layers`, `palette`, `readout`, `inspector` and `provenance`), so nothing lists issues at runtime (observed: Ctrl+K `open` offers no such panel).

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

None in Pager.

## Undo and redo

Not applicable: checks never change the document.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable: the panel is outside the canvas.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No accessibility or structure checks.** Required (features.json `accessibility-checks`):
   - The Checks panel lists each issue (for example an image without alt, a skipped heading level, low-contrast text, a link without text) with its rule, the element and a suggested fix.
   - Clicking an issue selects the element on the canvas and in Layers.
   - The list updates after every command.
   - Checks never block editing or export.
