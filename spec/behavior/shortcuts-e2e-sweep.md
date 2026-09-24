# shortcuts-e2e-sweep — Every listed shortcut works in its context

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Each binding below was pressed with the real keyboard in its context. Source references are `path:line` inside Pager. Test page: Section > [Heading, Paragraph, Container > Paragraph 2].

## Trigger

Pager's bindings live in **several tables**:

| Table | Where | Contexts |
|---|---|---|
| `KEYMAP` (29 rows) | `src/features/input/index.js:660-833` | `drag`, `global`, `hand`, `canvas`, `dock` |
| Command chords (`defineCommand({… keys})`) | `src/features/workspace/dock.js:551-611`, `src/app/boot.js:228` | any focus not in a text field |
| Text editor chords | `src/app/boot.js:695-701` | while editing text in place |
| Guide keys | `src/features/precision/index.js:396-422` | a guide is active |
| Absolute nudge | `src/features/input/index.js` (arrows without Alt on absolutely positioned selections) | canvas |

The Keyboard shortcuts panel is generated from `KEYMAP` only (see `shortcuts-panel.md`), so the chords of the other tables are not listed there.

## Hit zones and thresholds

The sweep, context by context (all observed):

| Context | Keys | Result |
|---|---|---|
| global | Delete, Backspace | selected Paragraph removed; `Removed: Paragraph`; nothing selected |
| global | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | `↶ Undone` restores; `↷ Redone` re-applies |
| global | Ctrl+C then Ctrl+V | `Pasted: Heading 2` (a second Heading) |
| global | Escape | selection cleared |
| global | `?` | status explains the layout: `display is block. The parent lays out as block, …` |
| canvas | Alt+ArrowDown / Alt+ArrowUp | `Moved 1 selected elements within Section.` |
| canvas | ArrowRight / ArrowLeft | next / previous sibling selected (`Paragraph selected. Sibling 2 of 3.`) |
| canvas | ArrowUp / ArrowDown | parent / first child selected |
| canvas | P | `Promoted Paragraph 2 into Section, position 4.` |
| canvas | R / C | `Wrapped Heading in a row. Row selected.` / `… in a column. Column selected.` |
| canvas | Enter | `TEXT Editing plain text — Enter or click away to keep it, Escape to cancel.` |
| canvas | F2 | inline rename (see `rename-element.md`) |
| canvas | M | `Holding Heading. Arrows aim, Enter places, Esc drops. …` |
| hand | ArrowDown / ArrowRight | aim moves: `Position 2 of 3` → `Position 3 of 3` |
| hand | ArrowUp | climbs: `Page will receive. Position 2 of 2. Level 2 of 2.` |
| hand | ArrowLeft | at level 1 nothing changed |
| hand | Enter | `Placed. Heading in Section, position 3 of 3.` |
| hand | Escape | `Dropped. Nothing changed.` |
| drag | ArrowUp / ArrowDown | the level changes (`… · ↑1`, `↑2`, back to `↑1`), but **only after the next pointer move**; with the pointer still, the label stayed `Move to position 4 · Section` |
| drag | Escape | `Cancelled — nothing changed` |
| any | Ctrl+D | `Duplicated: Heading 2` |
| any | Ctrl+B / Ctrl+Alt+B | `Elements / Layers hidden.` / `Inspector hidden.` (inspector 320 → 0 px); again shows them |
| any | Ctrl+\\ | `Every dock collapsed — Ctrl+\ puts back what was open.`; again `The docks are back as they were.` |
| any | Ctrl+= / Ctrl+- / Ctrl+0 | zoom 1 → 1.1 → 1; Ctrl+0 → 100 % |
| any | Ctrl+' | `Layout grid on, 12 columns …` / `… off …` |
| any | Ctrl+K | command bar opens |
| any | Ctrl+P, Ctrl+Enter | preview on (`Preview — interact with the page. Press Esc to return to editing`); Escape leaves it |
| dock | arrows, Enter | see `keyboard-panel-navigation.md` |

## Visual feedback

Each binding's own feedback is described in its feature's spec. The sweep adds none.

## Result in the document

As per binding (above).

## Undo and redo

As per binding.

## Nested elements

The canvas walk keys follow the tree (parent, first child, siblings).

## Zoom other than 100 %

The bindings do not depend on zoom.

## Keyboard equivalent

This is the keyboard feature.

## Problems in Pager

1. **Bindings are spread over several tables, and the shortcuts panel shows only one of them.** So no single list can be swept, and a chord such as Ctrl+D, Ctrl+B or Ctrl+' is invisible in the panel. Required (features.json `shortcuts-e2e-sweep`):
   - One keymap table holds every binding.
   - Each row declares its context setup and its check next to its binding, so a sweep test runs every row in its context and checks the document JSON, the selection or the UI state it changes.
   - Rows added later are swept without editing the test.
   - A unit test on the table proves that no two bindings in the same context use the same keys.
2. **The drag level keys act only on the next pointer move** (observed lag). Required: pressing ArrowUp/ArrowDown during a drag updates the proposal and its indicator at once.
3. **Ctrl+Enter enters preview but does not leave it** (see `preview-mode.md`). Required: Ctrl+Enter also leaves preview (features.json `preview-mode`), and the sweep checks it.
