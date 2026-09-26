# css-variables-tokens — Design tokens as CSS variables

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager.

## Trigger

- Pager keeps the project's variables in its state as `variables: Record<name, { kind, value }>` (`src/core/state.js:44`) and names a variable in a style value as `var(--name)`, optionally with a fallback (`src/model/provenance.js:23-27`, `tokenReference`).
- The Styles view lists the variables; a value typed as `var(--name)` in a field uses one.

## Result in the document

- A variable is stored once in the project, with its kind (colour, length) and value; an element that uses it stores `var(--name)` in its style, and the page resolves it.
- The provenance of a field shows the token a value names (`provenance.js:40-44`).

## Problems in Pager

1. **Variables are not written to the export.** Required: the export's stylesheet declares every variable in `:root` (`--name: value;`) and the elements' rules keep `var(--name)` where they use one.
2. **Renaming a variable leaves its uses pointing at a name that no longer exists.** Required: `tokens.rename` renames the variable and every `var(--name)` that uses it, in every page, as one undo step.
3. **A variable can be deleted while elements use it**, which leaves their values unresolved. Required: `tokens.delete` of a variable in use is refused, naming how many values use it (`status.token.inUse`); an unused one is deleted.
4. **Fields do not offer the variables.** Required: a colour field offers the colour variables, a length field the length variables and the font size field the font-size variables, as `var(--name)` next to the typed values; a value typed as `var(--name)` of a variable the project has is kept as written, and of one it does not have is refused.
5. **A variable's name and value are not checked.** Required: a name is a CSS custom property name without its dashes (letters, digits and `-`, starting with a letter), unique in the project (`status.token.nameTaken`, `status.token.badName`); a value is one the browser takes for its kind (a colour for a colour variable, a length for a length or font-size variable), else it is refused naming it.
6. **Changing a variable** changes every element that uses it at once, one undo step: the page draws the new value wherever it is used.

## Undo and redo

Creating, changing, renaming and deleting a variable are one undo step each.
