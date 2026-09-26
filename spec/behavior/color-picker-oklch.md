# color-picker-oklch — Colour picker: OKLCH and OKLab formats and CSS colour text

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager. It extends `color-picker.md`.

## Trigger

- In the colour picker, the format menu offers HSB, RGB, Hex, OKLCH and OKLab (`src/features/inspector/properties.js:152`); choosing OKLCH shows the fields L, C, H and α, OKLab the fields L, a, b and α (`:155`).
- The picker's text field takes any CSS colour text (`:218`, `applyTypedColour`).

## Hit zones and thresholds

- OKLCH: L from 0 to 1, C from 0 to 0.4, H from 0 to 360; OKLab: L from 0 to 1, a and b from −0.4 to 0.4 (`:162`, the ranges of the area's axes).

## Result in the document

- A channel field changed writes `oklch(L C H / α)` or `oklab(L a b / α)` with the four field values as typed (`:156`), the alpha always written, even when it is 1.
- A colour read from the stored text (`src/model/values.js:256`, `colorCoordinates`) shows its channels with up to five decimals (`:155`).
- A text typed in the text field is stored as typed when it is a colour.

## Undo and redo

As `color-picker.md`: every change inside the session is one undo step when Apply keeps it.

## Problems in Pager

1. **A channel value out of range is taken silently or dropped**: `change` runs for any finite number (`:156`), so C = 0.9 or L = 1.5 is written, and a text that is no number changes nothing without a word. Required: a value out of the channel's range (L 0–100 %, C 0–0.5, H 0–360, a and b −0.5–0.5) is refused with a message naming the channel (`status.colorPicker.invalid`), and the colour stays as it was.
2. **The alpha is written even for an opaque colour** (`oklch(0.7 0.15 260 / 1)`). Required: " / α" only when the colour is not opaque.
3. **L is shown and typed from 0 to 1**, while CSS and the other editors show a percentage. Required: L as a percentage from 0 to 100, written `oklch(70% 0.15 260)`.
4. **A colour outside sRGB is shown clamped with no word**: the area and the swatches can only show sRGB. Required: the colour is kept as written (a chroma beyond sRGB stays), and the picker says that it shows the nearest sRGB colour (`colorPicker.outOfGamut`).
5. **One reader of colours for every syntax**: named colours, hex with 3, 4, 6 and 8 digits, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() and color() are read by one owner (`src/core/style/color.ts`), the channels of every format coming from the same colour; a named colour is the one the page computes.
