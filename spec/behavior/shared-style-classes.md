# shared-style-classes — Reusable style classes

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager.

## Trigger

- Pager keeps class styles in each page's settings, `classStyles: Record<name, styles>` (`src/core/state.js:34`, blank in `src/commands/persist/envelope.js:23`), with their breakpoint and state layers (`bp`, `states`, `bpStates`).
- Pager writes each class as a rule of its own in the canvas and in the export (`src/model/css.js:363-400`). A class name that is not a CSS identifier is left out (`css.js:184`, `authoredClassName`).
- Pager has no control that creates a class, applies one, removes one or edits its styles: `classStyles` only reach a project from an imported file.

## Our rule

### Data

- A class belongs to the project: the document's `classes`, a list in the order the classes were made, each a name and its styles (the same breakpoints, states and properties as an element's). The list is absent while there is no class.
- An element names its classes in its `classes` list. A name with no class in the project is an author class that holds no styles, as before.

### Commands

- **Save the styles as a class** (`classes.create`, the selector bar's icon button; one element selected). The button opens a name field; Enter keeps the typed name, Escape closes the field. The name is trimmed. The result:
  - a new class of that name holds the element's own styles, every breakpoint and state;
  - the element holds no style of its own any more;
  - the class is added last to the element's classes.
  One undo step. The page looks the same: the element now takes those values from the class. The status bar says `status.classes.created`.
- **+ Class** (`classes.apply`, the selector bar's text button) opens a list:
  - first, the project's classes that not every selected element has;
  - then a field to type a name;
  - choosing a class, or Enter in the field, runs the command.
  The class is added last to every selected element that does not have it. A name the project has no class of is made a class with no styles, so it can be styled as a target. One undo step. The status bar says `status.classes.applied`.
- **The × of a class chip** (`classes.detach`) removes the class from every selected element that has it. The class stays in the project. One undo step, `status.classes.detached`.
- **The target chips** (`inspector.setStyleTarget`): Element first, then each class every selected element has.
  - Choosing a chip makes it the style target and draws it pressed.
  - A class target holds only while every selected element has the class. A new selection returns the target to Element. So does a class that is detached or undone away.
  - Choosing a chip of a project class changes nothing in the document and records nothing. Audit 7.1c: a legacy applied class with no project definition is registered as an empty project class on its first target click, in one undo step; the target becomes that class immediately. This is the only target click that changes the document.

### Editing a class

- While a class is the target, every style write of the inspector goes to the class's styles instead of the elements': style.set, the spacing, border, filter, transform, shadow, alignment and colour fields, and Reset. One undo step. Every element with the class changes. The status bar names the class as `.name`.
- The fields show the class's values.
- Below the chips, the selector bar says how far the edit reaches (`inspector.affects.one` / `inspector.affects.other`: ".button-primary affects 3 elements").

### The element over its classes

- An element's own values override its classes' values. In the canvas and in the export, the class rules come before the element rules, with the same specificity.
- With the Element target, a field whose property the element holds no value of, but one of its classes does, shows the class's value marked as coming from that class (the origin `class` and the class's name). A value of the element's own shows as before.

### Export

- The stylesheet writes each class that holds styles as one rule, `.name { … }`, in the project's order, after the design tokens' `:root` and before the element rules.
- An element's rule holds only its own values, the overrides. An element with a class and no style of its own gets no generated class of its own: its `class` attribute is its classes alone.

### Styles view

- The Styles view lists the project's classes, each with the number of elements that have it. Audit 7.1c adds Rename and Delete there: Rename updates the project definition and all uses in one undo step; Delete confirms the use count and removes the definition and every use, also in one undo step. A class's style values are still edited through the selector bar.

## Refusals

- A name that is not a CSS class name (a letter, `_` or `-` first, then letters, digits, `_` and `-`) is refused naming it (`status.classes.badName`), in Save as a class and in + Class.
- Save as a class with a name the project already has a class of is refused (`status.classes.nameTaken`).
- A locked element, or one inside a locked element, refuses every class command that would change it (`status.locked.edit`).

## Problems in Pager

1. **No control creates, applies, removes or edits a class.** Classes only come from an imported file. Required: the four commands above, each through its door in the selector bar.
2. **Classes are kept per page** (`envelope.js:23`, page settings), so the same class on two pages can hold different styles. Required: a class belongs to the project; one definition is used by every page.
3. **A class beats the element's own values.** The class rules are written after the element rules (`css.js:363-400`), with the same specificity. Required: an element's own values override its classes; the class rules come first.
4. **An invalid class name is silently left out of the stylesheet** (`css.js:184`). Required: an invalid name is refused when it is typed, naming it.
5. **Classes are written sorted by name** (`css.js:377`), not in the order the author made them. Required: the project's order.

## Undo and redo

- Each class command is one undo step.
- A style write to a class target is one undo step.
- Undo restores the document as it was, the selection with it.
