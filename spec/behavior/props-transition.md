# props-transition — Transition and will-change

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Effects: **Transition**, a text field (placeholder `all .2s ease`, `src/features/inspector/catalogue.js:404`; editor `text`, `properties.js:2434`).
- More: **Will change**, a menu of `auto`, `transform`, `opacity`, `scroll-position`, `contents` (`catalogue.js:493`).

## Hit zones and thresholds

Not applicable: both controls are fields of the inspector.

## Visual feedback

The field shows the stored value; a transition shows once the element's style changes.

## Result in the document

- Transition stores the typed text as the `transition` shorthand; Will change writes `will-change`.
- The computed transition longhands in the iframe match.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

Both fields are keyboard-operable like every inspector field.

## Problems in Pager

1. **The transition shorthand is stored as typed,** so the document holds text the editor cannot read back by part (a duration alone cannot be changed) and a typo (`opacity 3 ease`) is stored and dropped by the browser. Required: Transition is written as its longhands (property, duration, timing function, delay, behaviour), each holding the transitions' values in order; what a transition leaves out is the initial value; text that is no transition is refused with a message and nothing is written.
2. **Will change is a menu of five values,** leaving out the other properties a page may animate. Required: it takes any property name or list the browser takes, the menu suggesting the common ones.
