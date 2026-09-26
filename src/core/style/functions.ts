// CSS function lists (ARCHITECTURE.md; specs props-transforms, props-filters-clip): the functions a filter or a
// transform value holds in order (blur(4px) brightness(1.2); skewX(10deg)), one function's argument read from it, the
// value with one function set (in its place, else last) or taken away, and the translate value with one axis set.
// A field of one function (Blur, Skew X) and its command's handler (style.setFilter, style.setTransform) both use it.

export interface CssFunction {
  readonly name: string;
  readonly argument: string;
}

// the functions of a value, in order; null for a value that is no list of functions (none: the empty list)
export function functionsOf(value: string | undefined): CssFunction[] | null {
  const text = (value ?? '').trim();
  if (text === '' || text.toLowerCase() === 'none') return [];
  const out: CssFunction[] = [];
  let at = 0;
  while (at < text.length) {
    const head = /^\s*([a-zA-Z-]+)\(/.exec(text.slice(at));
    if (head === null) return null;
    let depth = 1;
    let i = at + head[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth += 1;
      if (text[i] === ')') depth -= 1;
    }
    if (depth !== 0) return null;
    out.push({ name: head[1] ?? '', argument: text.slice(start, i - 1).trim() });
    at = i;
    while (at < text.length && /\s/.test(text[at] ?? '')) at += 1;
  }
  return out;
}

export function functionArgument(value: string | undefined, name: string): string {
  return functionsOf(value)?.find((f) => f.name === name)?.argument ?? '';
}

// the value with the function set to an argument (in its place, else last), or taken away for an empty argument;
// none once it holds no function; null for a value that is no list of functions
export function withFunction(value: string | undefined, name: string, argument: string): string | null {
  const functions = functionsOf(value);
  if (functions === null) return null;
  const typed = argument.trim();
  const at = functions.findIndex((f) => f.name === name);
  const next = typed === '' ? functions.filter((f) => f.name !== name) : at >= 0 ? functions.map((f, i) => (i === at ? { name, argument: typed } : f)) : [...functions, { name, argument: typed }];
  return next.length === 0 ? 'none' : next.map((f) => `${f.name}(${f.argument})`).join(' ');
}

// The CSS function a field of one function edits, by its door's control (manifest data: the value's kind, then the
// function): filter-hue-rotate edits hue-rotate(), transform-skew-x edits skewX() (a function of one axis names it in
// a capital: skewX, scaleY, rotateZ).
export function functionOfControl(control: string): string {
  const name = control.split('-').slice(1).join('-');
  return name.replace(/-([xyz])$/, (_, axis: string) => axis.toUpperCase());
}

// The translate value with one axis set (0: x, 1: y), the axes before it zero when they have no value of their own.
export function translateWith(value: string | undefined, axis: number, typed: string): string {
  const held = (value ?? '').trim();
  const parts = held === '' || held.toLowerCase() === 'none' ? [] : held.split(/\s+/);
  const next = [...parts];
  for (let i = 0; i < axis; i++) next[i] ??= '0px';
  next[axis] = typed.trim();
  return next.join(' ');
}

// the value of one translate axis (0: x, 1: y), '' for none
export function translateAxis(value: string | undefined, axis: number): string {
  const held = (value ?? '').trim();
  return held === '' || held.toLowerCase() === 'none' ? '' : (held.split(/\s+/)[axis] ?? '');
}
