// The browser's side of the CSS support port (src/core/ports/css.ts): the editor runs in the same Chrome that draws
// the canvas, so its own CSS.supports answers whether a value means something for a property.
import type { CssSupport } from '../core/ports/css.ts';

export const browserCss: CssSupport = {
  supports: (property, value) => CSS.supports(property, value),
};
