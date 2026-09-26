# breakpoint-overrides — Style overrides per breakpoint, desktop first

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager.

## Trigger

- Pager stores each breakpoint's values in its own bag on the node (`n.bp[key]`), and reads a value at a breakpoint through the cascade of the breakpoints from the largest down to it (`bpStyleBags`, `src/model/style-layers.js:27-38`). Its CSS writes the base rule, then one `@media (max-width: Wpx)` block per breakpoint (`src/model/css.js:233-357`).

## Our rule

- Desktop is the base. With another breakpoint active (breakpoints-switch), every style write goes to that breakpoint's layer of the element (`styles → breakpoint → state → property`): `style.set`, the fields' steps and resets, the handles.
- What a field shows at the active breakpoint is its value there, else the value it inherits from the larger breakpoints above it (Tablet from Laptop, then Desktop). A field whose value is set at the active breakpoint shows a badge naming it (the origin "here"); an inherited one names where it comes from (the origin "breakpoint", with that breakpoint's name).
- The canvas draws the page at the active breakpoint's width, so its media queries apply: at Tablet and Phone a Tablet override shows, at Desktop and Laptop the base does.
- **Reset** of a field at a breakpoint removes that breakpoint's value only (`style.reset`): the inherited value shows again.
- The export's `styles.css` holds the base rule, then `@media (max-width: 1180px)`, `(max-width: 834px)` and `(max-width: 390px)` blocks in that order (the cascade order), each with the overrides of its breakpoint; the widths are the breakpoint table's.

## Refusals

As style.set's: a value the browser does not take, a locked element.

## Problems in Pager

1. **An inherited value and an override look the same** in the inspector. Required: the badge and the origin.
2. **Resetting at a breakpoint is not possible** from the field. Required: Reset removes that breakpoint's value only.

## Undo and redo

Each write and each reset is one undo step, as at Desktop.
