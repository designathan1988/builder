// The contract's lint rules on valid and invalid code, with ESLint's RuleTester. The style rules read the real
// generated tokens (src/ui/tokens.css), so a token used below is one the interface can use.
import css from '@eslint/css';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import builder, { builderCss } from './plugin.ts';
import { cssPropertyName, styleLiterals } from './style-values.ts';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const stylesheets = new RuleTester({ plugins: { css }, language: 'css/css' });
const tsx = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const scripts = new RuleTester({ languageOptions: { parser: tseslint.parser } });

scripts.run('builder/use-ports', builder.rules['use-ports'], {
  valid: [
    'const now = clock.now();',
    'const id = ids.next();',
    'const date = new Date(0);',
    'const { now } = clock;',
    'const x = Math.max(1, 2);',
  ],
  invalid: [
    { code: 'const t = Date.now();', errors: [{ messageId: 'time' }] },
    { code: 'const t = performance.now();', errors: [{ messageId: 'time' }] },
    { code: 'const t = window.performance.now();', errors: [{ messageId: 'time' }] },
    { code: 'const t = new Date();', errors: [{ messageId: 'time' }] },
    { code: 'const t = Date();', errors: [{ messageId: 'time' }] },
    { code: "const r = Math['random']();", errors: [{ messageId: 'id' }] },
    { code: 'const r = Math.random();', errors: [{ messageId: 'id' }] },
    { code: 'const u = crypto.randomUUID();', errors: [{ messageId: 'id' }] },
    { code: 'const u = globalThis.crypto.randomUUID();', errors: [{ messageId: 'id' }] },
    { code: 'crypto.getRandomValues(new Uint8Array(4));', errors: [{ messageId: 'id' }] },
    { code: 'const { now } = Date;', errors: [{ messageId: 'time' }] },
    { code: 'const { now: tick } = performance;', errors: [{ messageId: 'time' }] },
    { code: 'const { random } = Math;', errors: [{ messageId: 'id' }] },
    { code: 'const { randomUUID, getRandomValues } = crypto;', errors: [{ messageId: 'id' }, { messageId: 'id' }] },
  ],
});

tsx.run('builder/pointer-owner', builder.rules['pointer-owner'], {
  valid: [
    'button.addEventListener("click", run);',
    'window.addEventListener("keydown", onKey);',
    'input.addEventListener("change", pick);',
    'const b = <button onClick={run} onKeyDown={key} onFocus={f} onBlur={b} />;',
  ],
  invalid: [
    { code: 'overlay.addEventListener("pointerdown", press);', errors: [{ messageId: 'listener' }] },
    { code: 'window.removeEventListener("pointermove", move, true);', errors: [{ messageId: 'listener' }] },
    { code: 'document.addEventListener(`mousedown`, close);', errors: [{ messageId: 'listener' }] },
    { code: 'tile.addEventListener("dragstart", start);', errors: [{ messageId: 'listener' }] },
    { code: 'zone.addEventListener("drop", land);', errors: [{ messageId: 'listener' }] },
    { code: 'el.onpointerup = release;', errors: [{ messageId: 'listener' }] },
    { code: 'const a = <div onPointerDown={press} />;', errors: [{ messageId: 'prop' }] },
    { code: 'const a = <div onMouseEnter={open} onMouseLeave={close} />;', errors: [{ messageId: 'prop' }, { messageId: 'prop' }] },
    { code: 'const a = <div onDragOver={over} onDrop={land} />;', errors: [{ messageId: 'prop' }, { messageId: 'prop' }] },
    { code: 'const a = <div onPointerMoveCapture={move} />;', errors: [{ messageId: 'prop' }] },
  ],
});

scripts.run('builder/gesture-owner', builder.rules['gesture-owner'], {
  valid: ['store.dispatch("selection.select", { target });', 'const g = interactions.gestures;', 'gesture.commit();'],
  invalid: [
    { code: 'const g = store.gesture();', errors: [{ messageId: 'gesture' }] },
    { code: 'context.store.gesture().dispatch("element.insert", args);', errors: [{ messageId: 'gesture' }] },
  ],
});

scripts.run('builder/frame-owner', builder.rules['frame-owner'], {
  valid: [
    'const hit = nodeAt(canvasFrame(), point);',
    'import { nodeAt, nodeBox } from "../canvas/coordinates.ts";',
    { code: 'const doc = iframe.contentDocument; const el = doc.elementFromPoint(x, y);', filename: 'src/editor/canvas/coordinates.ts' },
    { code: 'renderer.mount(frame.contentDocument);', filename: 'src/editor/canvas/frame.tsx' },
    'label.textContent = name;',
  ],
  invalid: [
    { code: 'const doc = iframe.contentDocument;', errors: [{ messageId: 'reach' }] },
    { code: 'iframe.contentWindow.document.body.append(x);', errors: [{ messageId: 'reach' }] },
    { code: 'const page = window.frames[0];', errors: [{ messageId: 'reach' }] },
    { code: 'import { elementAt } from "../canvas/coordinates.ts";', errors: [{ messageId: 'element' }] },
    { code: 'import { screenBox as box } from "../canvas/coordinates.ts";', errors: [{ messageId: 'element' }] },
    { code: 'doc.body.appendChild(node);', filename: 'src/editor/canvas/coordinates.ts', errors: [{ messageId: 'write' }] },
    { code: 'el.setAttribute("data-hover", "");', filename: 'src/editor/canvas/coordinates.ts', errors: [{ messageId: 'write' }] },
    { code: 'el.classList.add("hover");', filename: 'src/editor/canvas/frame.tsx', errors: [{ messageId: 'write' }] },
    { code: 'el.style.outline = "1px solid";', filename: 'src/editor/canvas/frame.tsx', errors: [{ messageId: 'write' }] },
    { code: 'el.innerHTML = markup;', filename: 'src/editor/canvas/coordinates.ts', errors: [{ messageId: 'write' }] },
    { code: 'sheet.insertRule(rule);', filename: 'src/editor/canvas/frame.tsx', errors: [{ messageId: 'write' }] },
  ],
});

tsx.run('builder/keyboard-owner', builder.rules['keyboard-owner'], {
  valid: ['input.addEventListener("change", pick);', 'const i = <input onChange={type} onFocus={f} />;', 'const b = <button onClick={run} />;'],
  invalid: [
    { code: 'document.addEventListener("keydown", escape);', errors: [{ messageId: 'listener' }] },
    { code: 'window.removeEventListener(`keyup`, up);', errors: [{ messageId: 'listener' }] },
    { code: 'el.addEventListener("keypress", press);', errors: [{ messageId: 'listener' }] },
    { code: 'el.onkeydown = handle;', errors: [{ messageId: 'listener' }] },
    { code: 'const m = <div onKeyDown={arrows} />;', errors: [{ messageId: 'prop' }] },
    { code: 'const m = <div onKeyUpCapture={u} onKeyPress={p} />;', errors: [{ messageId: 'prop' }, { messageId: 'prop' }] },
  ],
});

tsx.run('builder/no-manifest-id', builder.rules['no-manifest-id'], {
  valid: [
    'const x = registerHandler("selection.select", run);',
    'const p = registerPredicate("hasSelection", test);',
    'const c = registerCodec("font-weight", codec);',
    'type Theme = CommandArgs["preferences.setTheme"]["theme"];',
    'const tab = doorSlots("file-tabs").find((d) => d.door.drawnAs === "item");',
    'const side = "block-start";',
  ],
  invalid: [
    { code: 'if (entry.command.id === "selection.select") run();', errors: [{ messageId: 'id' }] },
    { code: 'const door = "history.undo#toolbar-top-bar";', errors: [{ messageId: 'id' }] },
    { code: 'const sides = ["top", "left"];', errors: [{ messageId: 'id' }, { messageId: 'id' }] },
    { code: 'const d = <div data-door="ui.dismiss#overlay-backdrop" />;', errors: [{ messageId: 'id' }] },
    { code: 'dispatch(`element.insert`, args);', errors: [{ messageId: 'id' }] },
    { code: 'const h = other("selection.select", run);', errors: [{ messageId: 'id' }] },
    { code: 'const c = registerCodec(codec, "font-weight");', errors: [{ messageId: 'id' }] },
  ],
});

describe('style values', () => {
  it('turns React style keys into CSS property names', () => {
    expect(cssPropertyName('backgroundColor')).toBe('background-color');
    expect(cssPropertyName('WebkitBoxShadow')).toBe('-webkit-box-shadow');
    expect(cssPropertyName('msTransform')).toBe('-ms-transform');
    expect(cssPropertyName('--panel-x')).toBe('--panel-x');
  });

  it('places each literal at its offset in the value', () => {
    const literals = styleLiterals('padding', 'var(--space-4) 12px', { offset: 40, line: 3, column: 12 });
    expect(literals).toEqual([
      { kind: 'variable', text: '--space-4', start: 44, end: 53, property: 'padding', hint: '--space-*' },
      { kind: 'length', text: '12px', start: 55, end: 59, property: 'padding', hint: '--space-*' },
    ]);
  });
});

stylesheets.run('builder-css/use-tokens', builderCss.rules['use-tokens'], {
  valid: [
    '.a { color: var(--color-text); background: transparent; border-color: currentColor; }',
    '.a { padding: 0; margin: 0 auto; gap: var(--space-4); width: 100%; height: 100vh; max-width: none; inset: 0; }',
    '.a { padding: calc(var(--space-4) * 2); width: calc(100% - var(--size-sidebar)); min-height: max(var(--size-row), 50%); }',
    '.a { grid-template-columns: var(--size-activity-bar) var(--size-sidebar) 1fr var(--size-inspector); flex: 1 1 0; }',
    '.a { font: inherit; font-family: var(--font-ui); font-size: var(--fs-body); font-weight: var(--fw-label); }',
    '.a { line-height: var(--lh-body); letter-spacing: 0; } .b { line-height: calc(var(--lh-body) * 2); }',
    '.a { box-shadow: var(--shadow-2); border-radius: var(--radius-md); border: 1px solid var(--color-border); outline-offset: 2px; }',
    '.a { color: color-mix(in srgb, var(--color-accent) 20%, transparent); transition: color 150ms, background-color 150ms; }',
    '.a { --panel-gap: var(--space-4); gap: var(--panel-gap); }',
    '.b { gap: var(--later); } .a { --later: var(--space-2); }',
    '@font-face { font-family: Inter; src: url(inter.woff2); font-weight: 400; }',
    '@media (max-width: 800px) { .a { color: var(--color-text); } }',
    '.a { font-size: inherit; line-height: unset; width: auto; box-shadow: none; }',
  ],
  invalid: [
    {
      code: '.a {\n  color: #ff0000;\n}',
      errors: [
        {
          messageId: 'colour',
          data: { value: '#ff0000', property: 'color', hint: '--color-*', tokens: 'src/ui/tokens.css' },
          line: 2,
          column: 10,
          endLine: 2,
          endColumn: 17,
        },
      ],
    },
    {
      code: '.a { background: rgb(0 0 0 / 0.5); outline-color: oklch(70% 0.1 250); color: red; caret-color: Canvas; }',
      errors: [{ messageId: 'colour' }, { messageId: 'colour' }, { messageId: 'colour' }, { messageId: 'colour' }],
    },
    {
      code: '.a { padding: 8px 12px; margin-top: 1rem; }',
      errors: [
        { messageId: 'length', data: { value: '8px', property: 'padding', hint: '--space-*', tokens: 'src/ui/tokens.css' }, column: 15 },
        { messageId: 'length', data: { value: '12px', property: 'padding', hint: '--space-*', tokens: 'src/ui/tokens.css' }, column: 19 },
        { messageId: 'length', data: { value: '1rem', property: 'margin-top', hint: '--space-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '.a { width: calc(100% - 16px); top: 4px; max-height: 320px; flex-basis: 10em; }',
      errors: [
        { messageId: 'length', data: { value: '16px', property: 'width', hint: '--size-* or --space-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length', data: { value: '4px', property: 'top', hint: '--space-* or --size-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length' },
        { messageId: 'length' },
      ],
    },
    {
      code: '.a { border-radius: 4px; box-shadow: 0 1px 2px var(--color-border); }',
      errors: [
        { messageId: 'length', data: { value: '4px', property: 'border-radius', hint: '--radius-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length', data: { value: '1px', property: 'box-shadow', hint: '--shadow-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length', data: { value: '2px', property: 'box-shadow', hint: '--shadow-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '.a { font-size: 12px; font-weight: 600; line-height: 1.5; letter-spacing: 0.5px; font-family: "Segoe UI", sans-serif; }',
      errors: [
        { messageId: 'font', data: { value: '12px', property: 'font-size', hint: '--fs-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'font', data: { value: '600', property: 'font-weight', hint: '--fw-* or --weight-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'font', data: { value: '1.5', property: 'line-height', hint: '--lh-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'font', data: { value: '0.5px', property: 'letter-spacing', hint: '--ls-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'font', data: { value: '"Segoe UI"', property: 'font-family', hint: '--font-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'font', data: { value: 'sans-serif', property: 'font-family', hint: '--font-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '.a { font: italic 600 12px/18px system-ui; font-weight: bold; }',
      errors: [{ messageId: 'font' }, { messageId: 'font' }, { messageId: 'font' }, { messageId: 'font' }, { messageId: 'font' }],
    },
    {
      code: '.a { color: var(--color-nope); gap: var(--space-4, 8px); }',
      errors: [
        { messageId: 'variable', data: { name: '--color-nope', tokens: 'src/ui/tokens.css' }, column: 17 },
        { messageId: 'length', data: { value: '8px', property: 'gap', hint: '--space-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '.a { --brand: #123456; --inset: 12px; color: var(--brand); }',
      errors: [
        { messageId: 'colour', data: { value: '#123456', property: '--brand', hint: '--color-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length', data: { value: '12px', property: '--inset', hint: '--space-*, --size-* or --radius-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '.a { -webkit-box-shadow: 0 0 0 2px red; }',
      errors: [{ messageId: 'length' }, { messageId: 'colour' }],
    },
  ],
});

tsx.run('builder/use-tokens', builder.rules['use-tokens'], {
  valid: [
    "<div style={{ color: 'var(--color-text)', padding: 0, width: '100%', flex: 1, zIndex: 3, opacity: 0.5 }} />",
    '<div style={{ width: size, left: `${x}px`, height: `calc(${h}px + var(--size-row))` }} />',
    "<div style={{ '--offset': `${x}px`, top: 'var(--offset)' }} />",
    "<div style={{ gap: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'inherit' }} />",
    '<div style={style} className="a" />',
  ],
  invalid: [
    {
      code: "<div style={{ color: '#fff' }} />",
      errors: [{ messageId: 'colour', data: { value: '#fff', property: 'color', hint: '--color-*', tokens: 'src/ui/tokens.css' } }],
    },
    {
      code: "<div style={{ padding: 8, marginTop: '1rem' }} />",
      errors: [
        { messageId: 'length', data: { value: '8', property: 'padding', hint: '--space-*', tokens: 'src/ui/tokens.css' } },
        { messageId: 'length', data: { value: '1rem', property: 'margin-top', hint: '--space-*', tokens: 'src/ui/tokens.css' } },
      ],
    },
    {
      code: '<div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.5 }} />',
      errors: [{ messageId: 'font' }, { messageId: 'font' }, { messageId: 'font' }],
    },
    {
      code: "<div style={{ backgroundColor: active ? 'red' : 'var(--color-surface)', border: `${w}px solid black` }} />",
      errors: [{ messageId: 'colour' }, { messageId: 'colour' }],
    },
    {
      code: "<div style={{ color: 'var(--color-nope)' }} />",
      errors: [{ messageId: 'variable', data: { name: '--color-nope', tokens: 'src/ui/tokens.css' } }],
    },
    {
      code: "<div style={{ WebkitBoxShadow: '0 0 4px black' }} />",
      errors: [{ messageId: 'length' }, { messageId: 'colour' }],
    },
  ],
});

tsx.run('builder/no-literal-ui-string', builder.rules['no-literal-ui-string'], {
  valid: [
    "<p>{t('editor.label')}</p>",
    '<h1 className="app__title">{PRODUCT_NAME}</h1>',
    '<img alt="" src={url} />',
    "<button title={t('command.undo')} aria-label={label} type=\"button\" />",
    '<span> · </span>',
    '<span>&times;</span>',
    '<div className="app__title" data-testid="shell" role="toolbar" />',
    '<input type="text" name="query" autoComplete="off" />',
    "<p>{open ? t('a.open') : t('a.closed')}</p>",
    "<Door id=\"menu-language-en\" />",
  ],
  invalid: [
    {
      code: '<p>Hello</p>',
      errors: [{ messageId: 'text', data: { text: 'Hello' }, line: 1, column: 4 }],
    },
    { code: '<p>\n  3 items\n</p>', errors: [{ messageId: 'text', data: { text: '3 items' } }] },
    { code: '<p>Olá, mundo</p>', errors: [{ messageId: 'text', data: { text: 'Olá, mundo' } }] },
    { code: "<p>{'Hello'}</p>", errors: [{ messageId: 'text', data: { text: 'Hello' } }] },
    { code: "<p>{open ? 'Close' : t('a.open')}</p>", errors: [{ messageId: 'text', data: { text: 'Close' } }] },
    { code: '<p>{`${count} items`}</p>', errors: [{ messageId: 'text', data: { text: '… items' } }] },
    { code: '<button title="Close" />', errors: [{ messageId: 'attribute', data: { attribute: 'title', text: 'Close' } }] },
    { code: "<input placeholder={'Search'} />", errors: [{ messageId: 'attribute', data: { attribute: 'placeholder', text: 'Search' } }] },
    { code: '<img alt="Logo" />', errors: [{ messageId: 'attribute', data: { attribute: 'alt', text: 'Logo' } }] },
    {
      code: "<div aria-label={cond ? 'Open' : 'Closed'} />",
      errors: [
        { messageId: 'attribute', data: { attribute: 'aria-label', text: 'Open' } },
        { messageId: 'attribute', data: { attribute: 'aria-label', text: 'Closed' } },
      ],
    },
    { code: '<Field label="Name" />', errors: [{ messageId: 'attribute', data: { attribute: 'label', text: 'Name' } }] },
    { code: '<div aria-description={`Step ${n}`} />', errors: [{ messageId: 'attribute', data: { attribute: 'aria-description', text: 'Step …' } }] },
  ],
});
