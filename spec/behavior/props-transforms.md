# props-transforms — Move, rotate, scale, skew, origin and 3D settings

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Effects: the transform editor (`ppTransform`, `src/features/inspector/properties.js:1912-1985`): a stage where the box is dragged to move it, its corner to scale it and a ring handle to rotate it, and six number fields, **X**, **Y** (px or %), **Rotate** (deg), **Scale**, **Skew X**, **Skew Y** (deg) (`:1934-1950`); and the text fields **Transform**, **Scale**, **Rotate**, **Transform origin** (`catalogue.js:399-403`).
- More (`catalogue.js:461-465`): **Perspective** (a length), **Perspective origin** (text), **Transform style** (`flat`, `preserve-3d`), **Back face** (`visible`, `hidden`), **Transform box** (five values).

## Hit zones and thresholds

| Part | Mapping |
|---|---|
| The box dragged | X and Y follow the pointer, px (`:1968-1973`). |
| The corner dragged | Scale = start + travel / 90, from 0.2 to 2 (`:1974`). |
| The ring handle dragged | Rotate = the pointer's angle around the ring, whole degrees (`:1975-1979`). |

## Visual feedback

The stage's box shows the transform (its moves clamped to the stage, `:1953-1955`); the canvas draws the element again at once.

## Result in the document

- The editor writes the whole transform as one value (`options.onChange(Object.assign({}, v))`, `:1952`).
- Transform origin, Perspective, Perspective origin, Transform style, Back face and Transform box write their properties.
- The computed values in the iframe match.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the controls are in the Inspector).

## Keyboard equivalent

The fields and menus are keyboard-operable like every inspector field; the stage's drags have no keyboard equivalent.

## Problems in Pager

1. **Move, rotate and scale are written into one transform value** together with the skews, so one of them cannot be changed without rewriting the others. Required: Move X and Move Y write the translate property (one axis each, the other kept; an axis before the one typed is zero when it has no value), Rotate the rotate property, Scale the scale property; Skew X and Skew Y write their function in the transform value (each in its place, the other functions kept), through one command, `style.setTransform`.
2. **A value the browser does not take is stored** (the text fields keep any text). Required: a value the browser does not take is refused with a message and nothing is written.
