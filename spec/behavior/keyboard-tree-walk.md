# keyboard-tree-walk — Walk the tree with the arrow keys

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test document: Section > [Heading, Paragraph].

## Trigger

With the canvas focused, something selected, nothing in the hand and no drag (`src/app/boot.js:560-569`):

| Key | Action | Source |
|---|---|---|
| ArrowRight | select the next sibling | `src/features/input/index.js:727-735` |
| ArrowLeft | select the previous sibling | same |
| ArrowUp | select the parent | `:736-742` |
| ArrowDown | select the first child | `:743-750` |

When the selection is absolutely or fixed positioned, the arrows nudge it instead (see `absolute-nudge.md`, `input/index.js:719-726`). With Ctrl or Meta held the canvas keymap does nothing (`boot.js:565`).

## Hit zones and thresholds

Not a pointer gesture. Siblings are counted without hidden or locked filtering (`kidsOf`).

## Visual feedback

The selection outline and the Layers row follow; the status bar announces each step. Observed sequence starting on the Heading:

| Key | Selected | Status |
|---|---|---|
| ArrowRight | Paragraph | `Paragraph selected. Sibling 2 of 2.` |
| ArrowLeft | Heading | `Heading selected. Sibling 1 of 2.` |
| ArrowLeft | Heading | `No previous sibling in Section.` |
| ArrowUp | Section | `Section selected. Parent.` |
| ArrowDown | Heading | `Heading selected. First child of Section.` |
| ArrowUp | Section | `Section selected. Parent.` |
| ArrowUp | Section (stays) | `Already at the root.` |
| ArrowRight | Section (stays) | `No next sibling in Page.` |

## Result in the document

Walking never changes the document JSON (observed: identical outline after every key).

## Undo and redo

Not undo steps.

## Nested elements

One level per key.

## Zoom other than 100 %

Not affected. The canvas does not scroll to a newly selected element that is off screen.

## Keyboard equivalent

This is the keyboard feature.

## Problems in Pager

1. **ArrowUp from a direct child of the Page says `Already at the root.`** and does not select the Page, while the Page can be selected by clicking. Required: ArrowUp selects the Page root; at the Page root it says `Already at the root.`
2. **The walk does not reveal off-screen elements.** Required: walking to an element outside the canvas viewport scrolls it into view (nearest edge).
