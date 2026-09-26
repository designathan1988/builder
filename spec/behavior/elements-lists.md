# elements-lists — Unordered, Ordered and Definition lists with their items

How Pager behaves, read from its source (this spec was written without running Pager). Source references are `path:line` inside Pager.

## Trigger

- The Elements panel's **Lists** group: Unordered (`ul`), Ordered (`ol`), Definition (`dl`), and also List item (`li`), Term (`dt`) and Description (`dd`) (`src/model/elements.js:32-38`). A click on a tile inserts the element (the rules of palette-click-insert: into a selected container, after a selected leaf, at the end of the page with nothing selected); a drag places it (palette-drag-insert).
- Items are added by duplicating an item (Ctrl+D or the context menu's Duplicate, the duplicate feature), or by inserting the List item, Term or Description tile.

## Result

- Each list tile makes an **empty** container (`src/model/templates.js:37-39`): a `ul` named **List** (its tile reads "Unordered"), an `ol` named Ordered list, a `dl` named Definition list, all with no children and no styles.
- The item tiles make empty containers too (`src/model/templates.js:40-42`): an `li` named **Item**, a `dt` named Term, a `dd` named **Definition** (its tile reads "Description").
- An item tile clicked where its list is missing is wrapped in a new list (`WRAP_IN`, `src/model/elements.js:125-127`; observed in nesting-grammar: the page root selected, List item makes a new `ul` holding the `li`). A Paragraph clicked into a list is wrapped in a new `li` (`adoptChain`, `src/model/grammar.js:70-76`).
- `ul` and `ol` accept only `li`; `dl` accepts only `dt` and `dd` (`src/model/elements.js:33-35`, `only`); `li` needs a `ul` or `ol`, `dt` and `dd` a `dl` (`src/model/elements.js:36-38`, `needs`).
- Names come from a counter per session (`src/model/templates.js:7`, `autoName`), not from the names the document holds.
- The ready-made lists with three items ("First item", "Second item", …) are templates (`src/model/templates.js:122-127`), which belong to templates-content.

## Visual feedback

| Stage | What is drawn |
|---|---|
| After a list tile click | An empty list: no marker, no text, only the canvas's minimum height for an empty container, selected with its label; the Layers row appears. |
| After an item tile click | An empty `li` (a marker with nothing beside it), or an empty `dt`/`dd`. |
| After Ctrl+D on an item | The copy right after its original; an ordered list numbers it on. |

## Undo and redo

Each insert is one undo step; each duplicate is one undo step.

## Keyboard equivalent

A focused tile inserts with Enter or Space (palette-click-insert). Ctrl+D duplicates the selected item (duplicate).

## Problems in Pager

1. **A new list is empty** (`src/model/templates.js:37-39`): an Unordered or Ordered list shows no marker and holds nothing to type into, and a Definition list holds no term; exported, it is an empty `<ul></ul>`. Required: a new list comes with its items, so it is never empty: an Unordered or Ordered list with one List item, a Definition list with one Term followed by one Description, from every door that inserts it (a tile's click, Enter or Space on it, its drag).
2. **A new item is empty** (`src/model/templates.js:40-42`): the `li` has no text, so it draws a lone marker. Required: each List item, Term and Description of a new list holds one Paragraph with the Paragraph's default text (`elements.json`: the natural child of `li`, `dt` and `dd` is the Paragraph; the same content natural-child-command gives a new `li`, its Problems in Pager 3).
3. **List item, Term and Description are palette tiles** (`src/model/elements.js:36-38`), so an item can be inserted where it cannot exist and Pager has to invent a list around it. Required: the Lists group offers Unordered, Ordered and Definition only (`elements.json` palette); an item is added by duplicating one (Ctrl+D, the context menu's Duplicate), whose copy goes right after its original, inside the same list, with a fresh name for it and for the Paragraph inside it (duplicate). No door of this feature places an item outside its list; the refusal of an item moved outside a list (`status.refused.requiresParent`) belongs to nesting-grammar.
4. **A Paragraph clicked into a list is wrapped in a new `li` without a word** (`src/model/grammar.js:70-76`), and so is a list clicked into a list. Required, as palette-click-insert (its Problems in Pager 1 and 2): an element a list does not accept is refused with `status.refused.onlyAccepts` naming the list's tag and the tags it accepts (`<ul>` and `<ol>` only `<li>`; `<dl>` only `<dt>`, `<dd>`, `<div>`), and nothing changes. A list is accepted inside a List item, a Term or a Description, so lists nest inside items.
5. **Names do not match the tiles and are counted per session** (`src/model/templates.js:7`, `:37`, `:40`, `:42`): the Unordered list is named "List", the List item "Item", the Description "Definition", and a second list is "List 2" even when the first was deleted. Required: every new node, the list and each node inside it, is named by its element label in the person's language (Unordered list, Ordered list, Definition list, List item, Term, Description, Paragraph), numbered only when the document already holds that name or an earlier node of the same insert took it (a Definition list's second Paragraph is "Paragraph 2").
6. **An empty list renders nothing a person can read on the page.** Required: the frame and the export write the standard tags (`ul`/`ol`/`li`, `dl`/`dt`/`dd`) with no style of the editor's own: the browser's defaults draw the markers (a disc for `ul`, a number for `ol`, a circle for a `ul` inside a list) and indent the Description.
