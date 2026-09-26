# theme-switch — Light, dark and system theme

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager.

## Trigger

- Pager: the app menu's Theme submenu, Light, Dark and System (`src/features/workspace/dock.js:375-387`), sets the document's colour scheme and stores the choice with the workspace.

## Our rule

- **Theme › Light, Dark, System** (`preferences.setTheme`), radio items, the chosen one checked.
- Light and Dark force the editor chrome's colour tokens (`data-theme` on the document); System follows `prefers-color-scheme`, live, as the browser's scheme changes. The page inside the frame keeps its own colours: the theme is the editor's, never the page's.
- The choice is a preference, restored after a reload; the default is environment.json's.

## Refusals

None.

## Problems in Pager

1. **Choosing System does not follow a later change of the browser's scheme** until a reload. Required: System follows it live (the tokens are declared under `prefers-color-scheme`).

## Undo and redo

Not affected: the theme records nothing.
