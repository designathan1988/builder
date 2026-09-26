# reusable-components — Reusable components with instances

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager.

## Trigger

- Pager's state can hold `components: Record<name, { tree, group?, variants? }>` (`src/core/state.js:44-49`). A node can name its component (`component`, `state.js:16`).
- Layers flags such a node (`src/features/layers/layers-panel.js:314-318`, "Component of {name}"). The inspector shows a Component chip on it (`src/features/inspector/properties.js:2803`). The provenance names the component a node comes from (`src/model/provenance.js:29-36`).
- Pager has no command that makes a component, places an instance or detaches one. An instance does not follow its component: nothing copies a change of the component into its instances.

## Our rule

### Data

- A component belongs to the project: the document's `components`, a list in the order they were made. Each has a name, unique in the project, and its definition, a tree of elements like a page's.
- An instance is a real subtree of a page.
  - Its root names its component (`component`: the component's name).
  - Each of its elements records the place of the definition element it comes from (`componentPart`: the child indexes from the definition's root; `[]` for the root).
  - Everything else (rendering, selection, Layers, the export) sees ordinary elements.

### Commands

- **Create a component** (`components.create`: the context menu's item, the command bar; one element selected).
  - The selected element and its subtree become the definition of a new component, named after the element. A name the project already has a component of takes a number: "CardA 2".
  - The element itself becomes its first instance.
  - One undo step, `status.components.created`.
  - The page root is refused (`status.components.root`). So is an instance, or an element inside one (`status.components.inInstance`), and a locked element (`status.locked.edit`).
- **Place a component** (`components.insertInstance`) inserts a new instance of the component.
  - The Insert view shows a tile per component, in a Components group after the element groups (DESIGN.md `insert` 7).
  - The tile's click places it where element.insert places a tile: into the selected container, after a selected leaf, else at the end of the page. The tile's drag places it where it is dropped, as a palette tile's creation drag does.
  - The instance's elements take the definition's elements, each with a new id and a name no other element has.
  - The content model and locks refuse it as they refuse an element (`placementRefusal`). One undo step. The instance becomes the selection.
- **Detach from the component** (`components.detach`: the context menu's item, the command bar; predicate `instanceSelected`, an instance's root selected alone) turns the instance into an ordinary subtree: its elements forget their component and their parts. One undo step, `status.components.detached`.

### Instances follow their component

- A style write on an element of an instance (every write of `core/style/set.ts`: style.set, spacing, border, filters…) goes to the definition's element and to the same element of every instance of the component, in every page. One undo step. The status bar names the element written.
- A text or an attribute set on an element of an instance stays on that instance: it is its override. A new instance takes the definition's text and attributes.
- An element added inside an instance, or taken out of it, belongs to that instance alone.
- The export writes every instance as plain HTML. The elements of instances that come from the same definition element, and hold the same styles, share one generated class, so the stylesheet writes the component's styles once.

## Refusals

- `status.components.root`: the page root.
- `status.components.inInstance`: an instance, or an element inside one.
- `status.locked.edit`: a locked element, for Create a component.
- `placementRefusal` and `status.locked.insert`, for Place a component; `status.components.inInstance` for an instance placed inside an instance.

## Problems in Pager

1. **No command makes, places or detaches a component.** Components only come from an imported file. Required: the three commands, each through its doors.
2. **Instances do not follow their component.** Nothing copies a change of the component into its nodes. Required: a style write on an instance's element reaches the definition and every instance, one undo step.
3. **An override has no rule.** Pager keeps no difference between what an instance changes and what it takes from its component. Required: a text or an attribute set on an instance stays on it, and a style is the component's.
4. **The export repeats the styles.** Each node gets its own class. Required: the elements of instances share one class per definition element, so the component's styles are written once.

## Undo and redo

- Each command is one undo step.
- A style write that reaches every instance is one undo step.
- Undo restores the document and the selection.
