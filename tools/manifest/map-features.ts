// npm run manifest:map [-- --rev <git revision>]
// Proves the conversion from features.json to the manifest lost nothing: every features.json id maps to
// exactly one manifest feature, in the same order, and every title, step and expected line is preserved
// verbatim in that feature's intent, except the declared amendments that resolved the review's open points.
// Reads features.json from the working tree when it exists, otherwise from git (it was deleted after this check).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadManifest, REPO_ROOT } from './load.ts';

interface OldFeature {
  id: string;
  title: string;
  steps: string[];
  expected: string[];
}
interface Intent {
  title: string;
  steps: string[];
  expected: string[];
}
interface Amendment {
  feature: string;
  field: 'title' | 'steps' | 'expected';
  op: 'append' | 'replace';
  from?: string;
  to: string;
  why: string;
}

// The three points the last review left open: no older saved format exists; one meaning per modifier
// while resizing (Alt from the centre, Ctrl suspends snapping); an opened folder's stylesheets are parsed
// into the document and the original .css files stay as ordinary, unlinked files.
// The property model (longhands, composites, generated value lists, translate/rotate/scale) rewrote
// the intent lines that still described shorthand writes and one composed transform value.
export const AMENDMENTS: Amendment[] = [
  {
    feature: 'autosave-restore',
    field: 'expected',
    op: 'append',
    to: 'The IndexedDB record carries the schema version of the saved format from the first save, the same version project.json carries; every future migration is tested on this real loading path.',
    why: 'no older saved format exists; the schema version is carried from the first save',
  },
  {
    feature: 'explorer-file-system',
    field: 'expected',
    op: 'replace',
    from: 'The tree is stored with the project in IndexedDB and restored after reload; File > Save project and Open project include every file of the tree, and an archive saved in the earlier format (before pages and the file tree) opens and is migrated to the current format; the autosaved project and its saved versions from that format are migrated the same way when the app loads them.',
    to: 'The tree is stored with the project in IndexedDB and restored after reload; File > Save project and Open project include every file of the tree. The product is new, so there is no earlier saved format to open: the saved format has carried a schema version since the first save, and every future migration is tested on the real loading path (Open project, and the autosaved project and its saved versions when the app loads them).',
    why: 'no older saved format exists; the requirement to open one is removed',
  },
  {
    feature: 'snap-while-moving',
    field: 'steps',
    op: 'replace',
    from: 'Repeat holding Alt.',
    to: 'Repeat holding Ctrl.',
    why: 'Ctrl suspends snapping; Alt resizes from the centre (report PG-14)',
  },
  {
    feature: 'snap-while-moving',
    field: 'expected',
    op: 'replace',
    from: 'Holding Alt suspends snapping for that gesture.',
    to: 'Holding Ctrl suspends snapping for that gesture, when resizing and when moving; Alt keeps its one resize meaning, resizing from the centre, so each modifier has one meaning per gesture (report PG-14).',
    why: 'Ctrl suspends snapping; Alt resizes from the centre (report PG-14)',
  },
  {
    feature: 'explorer-open-folder',
    field: 'expected',
    op: 'replace',
    from: 'HTML pages go through the HTML importer with their linked CSS resolved from the folder; each becomes a page named after its file, at its path (about/index.html is the page index in the folder about), and the root index.html is the home page (a folder without one gets an empty home page index.html, listed in the report); CSS, JS, images and fonts are kept as files.',
    to: "HTML pages go through the HTML importer: the stylesheets they link are resolved from the folder and parsed into the document's styles, because the document JSON is the source of truth; each page becomes a page named after its file, at its path (about/index.html is the page index in the folder about), and the root index.html is the home page (a folder without one gets an empty home page index.html, listed in the report); the original .css files stay in the tree as ordinary files that no page links any more, and the import report says so; JS, images and fonts are kept as files.",
    why: 'linked stylesheets are parsed into the document; the .css files stay as unlinked files',
  },
  {
    feature: 'props-display',
    field: 'expected',
    op: 'replace',
    from: 'The Display control offers every keyword the property catalogue has for display, and nothing else (a unit test checks that the control options equal the catalogue keyword list).',
    to: 'The Display control offers exactly the list its door names in the manifest (the declared display subset, drawn from the generated keyword list) and nothing else (a unit test checks that the control options equal that list); a typed value is accepted only when it matches the official display syntax.',
    why: 'property model: a door offers the generated list of its property or a declared subset',
  },
  {
    feature: 'props-spacing',
    field: 'expected',
    op: 'replace',
    from: 'Linked sides change together and write the margin shorthand; unlinked sides write per-side values.',
    to: 'Linked sides change together: one command writes the four longhands (margin-top, margin-right, margin-bottom, margin-left) as one undo step; unlinked sides write their own longhand.',
    why: 'property model: the document stores only longhands and a composite writes all of them in one command',
  },
  {
    feature: 'props-typography',
    field: 'expected',
    op: 'replace',
    from: 'Each keyword control offers every keyword the property catalogue defines for it.',
    to: 'Each keyword control offers the list its door names: the generated keywords of the property that Chrome, Firefox and Safari all support according to css-compat.json, or a subset the manifest declares with its reason.',
    why: 'property model: a door offers the generated keywords all three browsers support, or a declared subset',
  },
  {
    feature: 'props-typography-advanced',
    field: 'expected',
    op: 'append',
    to: 'Line clamp is a compatibility recipe: one command and one undo step write every declaration browsers need to clamp (the legacy box display, its vertical orientation, the legacy line clamp and hidden overflow). While it is set, the Display and Overflow fields show the clamp; choosing a display or an overflow there clears the clamp in the same command; clearing the clamp removes its declarations and restores the display and overflow values it replaced.',
    why: 'property model: browsers clamp lines only through the legacy recipe (CSS Overflow 4, legacy compatibility)',
  },
  {
    feature: 'props-effects-basic',
    field: 'expected',
    op: 'append',
    to: 'Text selection (user-select) is a compatibility recipe: one command and one undo step write the standard property and the prefixed form Safari needs.',
    why: 'property model: Safari supports user-select only with a prefix (css-compat.json)',
  },
  {
    feature: 'props-border-outline',
    field: 'expected',
    op: 'replace',
    from: 'The border style control offers every catalogue keyword (none, solid, dashed, dotted, double, groove, ridge, inset, outset, hidden).',
    to: 'The border style control offers every keyword of the generated border-style list (none, hidden, dotted, dashed, solid, double, groove, ridge, inset, outset).',
    why: 'property model: a door offers the generated list of its property or a declared subset',
  },
  {
    feature: 'props-border-outline',
    field: 'expected',
    op: 'replace',
    from: 'All-sides edits write the shorthand; single-edge edits write that side only; the computed borders in the iframe match.',
    to: 'All-sides edits write the width, style and colour longhands of every side in one command and one undo step; single-edge edits write the longhands of that side only; the computed borders in the iframe match.',
    why: 'property model: the document stores only longhands and a composite writes all of them in one command',
  },
  {
    feature: 'shadow-editor',
    field: 'expected',
    op: 'replace',
    from: 'The box-shadow list is written to the document JSON in layer order; hidden layers are left out of the CSS.',
    to: 'The shadow layers are written to the document JSON as one box-shadow value made of typed layers (X, Y, blur, spread, colour, inset, hidden), in layer order, by one command per change; the codec writes the visible layers as the box-shadow list, and hidden layers stay in the document but are left out of the CSS.',
    why: 'property model: browsers implement box-shadow, not the box-shadow-* longhands (css-compat.json), so box-shadow is stored as a structured shadow list',
  },
  {
    feature: 'props-transforms',
    field: 'expected',
    op: 'replace',
    from: 'The transform fields compose one transform value written to the document JSON; the computed transform matrix in the iframe matches it.',
    to: 'Move X/Y write translate, Rotate writes rotate and Scale writes scale, each its own property in the document JSON; Skew X/Y compose the transform value, which holds only the functions translate, rotate and scale do not cover; the computed translate, rotate, scale and transform in the iframe match.',
    why: 'property model: translate, rotate and scale are their own properties; transform keeps skew',
  },
  {
    feature: 'props-transforms',
    field: 'expected',
    op: 'replace',
    from: 'Move X/Y, Rotate, Scale and Skew are written by one transform command that composes the transform value, and every other control of the transform (on the canvas or elsewhere) must use that command.',
    to: 'Every control of translate, rotate or scale (the inspector, the quick panel, the rotation handle) writes that one property through the same command and door data; no control parses or rebuilds a transform list to change a move, a rotation or a scale.',
    why: 'property model: translate, rotate and scale are their own properties; transform keeps skew',
  },
  {
    feature: 'props-more',
    field: 'steps',
    op: 'replace',
    from: 'Set scroll-behavior, overscroll-behavior, scroll-snap-type, scroll-snap-align, counter-reset, counter-increment and all.',
    to: 'Set scroll-behavior, scroll-snap-type, scroll-snap-align, counter-reset and counter-increment.',
    why: 'property model: all is the shorthand of every property, which the longhand-only document cannot store; overscroll-behavior is not edited because Safari implements it only partially (css-compat.json)',
  },
  {
    feature: 'quick-panel',
    field: 'expected',
    op: 'replace',
    from: "Every quick panel control runs the same command as the matching inspector field and writes the same document JSON, and both stay in sync; Fill opens the same fill editor as the inspector (solid colour or gradient), and Transform writes the same transform value as the inspector's transform fields.",
    to: 'Every quick panel control runs the same command as the matching inspector field and writes the same document JSON, and both stay in sync; Fill opens the same fill editor as the inspector (solid colour or gradient), and the Move X, Rotate and Scale controls of Transform write translate, rotate and scale like the inspector fields.',
    why: 'property model: translate, rotate and scale are their own properties; transform keeps skew',
  },
  {
    feature: 'radius-border-gap-handles',
    field: 'expected',
    op: 'replace',
    from: 'Radius mode shows a corner handle labelled with the current radius and writes border-radius.',
    to: 'Radius mode shows a corner handle labelled with the current radius and writes the four corner radius longhands in one command.',
    why: 'property model: the document stores only longhands and a composite writes all of them in one command',
  },
  {
    feature: 'radius-border-gap-handles',
    field: 'expected',
    op: 'replace',
    from: 'Gap modes show bands between children and write gap, row-gap or column-gap; the measured distance between children in the iframe matches.',
    to: 'Gap modes show bands between children: Gap writes row-gap and column-gap together in one command, Row gap and Column gap write their own longhand; the measured distance between children in the iframe matches.',
    why: 'property model: the document stores only longhands and a composite writes all of them in one command',
  },
  {
    feature: 'rotation-handle',
    field: 'expected',
    op: 'replace',
    from: 'The handle and the Rotate field run the same command and write the rotate part of the one transform value; a whole drag is one undo step.',
    to: 'The handle and the Rotate field run the same command and write the rotate property, never the transform list; a whole drag is one undo step.',
    why: 'property model: translate, rotate and scale are their own properties; transform keeps skew',
  },
  {
    feature: 'absolute-anchors',
    field: 'expected',
    op: 'replace',
    from: 'Anchoring the centre stores left:50% with a translate so the element stays centred.',
    to: 'Anchoring the centre stores left and right 0 with auto side margins and a fit-content width (top, bottom, auto margins and a fit-content height for the vertical centre), so the element stays centred without translate, which belongs to Move X/Y.',
    why: 'property model: translate belongs to Move X/Y, so centring uses auto margins (measured centred in Chrome 153)',
  },
  {
    feature: 'ui-language',
    field: 'title',
    op: 'replace',
    from: 'UI language: Brazilian Portuguese by default, English available',
    to: 'UI language: English by default, Brazilian Portuguese available',
    why: 'the design decision brief: everything on disk is in English and the UI language is switchable, so English is the source and default UI language and pt-BR is a translation',
  },
  {
    feature: 'ui-language',
    field: 'steps',
    op: 'replace',
    from: 'Switch the UI language to English from the app menu, then back to Português (Brasil).',
    to: 'Switch the UI language to Português (Brasil) from the app menu, then back to English.',
    why: 'the design decision brief: everything on disk is in English and the UI language is switchable, so English is the source and default UI language and pt-BR is a translation',
  },
  {
    feature: 'ui-language',
    field: 'expected',
    op: 'replace',
    from: 'A fresh profile shows every UI text in pt-BR: menus, panels, tooltips, status bar messages and accessible names.',
    to: 'A fresh profile shows every UI text in English: menus, panels, tooltips, status bar messages and accessible names; after switching to Português (Brasil) every one of them is in pt-BR.',
    why: 'the design decision brief: everything on disk is in English and the UI language is switchable, so English is the source and default UI language and pt-BR is a translation',
  },
];

function readOldFeatures(): { source: string; features: OldFeature[] } {
  const args = process.argv.slice(2);
  const revAt = args.indexOf('--rev');
  const file = path.join(REPO_ROOT, 'features.json');
  if (revAt < 0 && fs.existsSync(file)) return { source: 'features.json (working tree)', features: JSON.parse(fs.readFileSync(file, 'utf8')) as OldFeature[] };
  const rev = revAt >= 0 ? (args[revAt + 1] ?? 'HEAD') : 'ffecbb5';
  const text = execFileSync('git', ['show', `${rev}:features.json`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { source: `features.json at git revision ${rev}`, features: JSON.parse(text) as OldFeature[] };
}

const { source, features: old } = readOldFeatures();
const { input } = loadManifest();
const manifest: { id: string; intent: Intent; file: string }[] = [];
for (const file of Object.keys(input.files).filter((f) => f.startsWith('features/')).sort()) {
  const data = input.files[file] as { features: { id: string; intent: Intent }[] };
  for (const f of data.features) manifest.push({ id: f.id, intent: f.intent, file });
}

const failures: string[] = [];
const oldIds = old.map((f) => f.id);
for (const id of oldIds) {
  const count = manifest.filter((m) => m.id === id).length;
  if (count !== 1) failures.push(`${id}: ${count} manifest features have this id, expected exactly 1`);
}
for (const m of manifest) if (!oldIds.includes(m.id)) failures.push(`${m.id}: manifest feature with no features.json entry`);
const sameOrder = old.length === manifest.length && old.every((f, i) => manifest[i]?.id === f.id);
if (!sameOrder) failures.push('the manifest features are not in the features.json order');

let lines = 0;
let verbatim = 0;
let titles = 0;
const used = new Set<Amendment>();
for (const f of old) {
  const target = manifest.find((m) => m.id === f.id);
  if (!target) continue;
  let wantTitle = f.title;
  for (const a of AMENDMENTS.filter((x) => x.feature === f.id && x.field === 'title')) {
    if (a.from === f.title) wantTitle = a.to;
    else failures.push(`${f.id}.title: the amendment "${a.why}" did not find its title`);
    used.add(a);
  }
  if (target.intent.title === wantTitle) titles++;
  else failures.push(`${f.id}: title changed`);
  for (const field of ['steps', 'expected'] as const) {
    const want = [...f[field]];
    for (const a of AMENDMENTS.filter((x) => x.feature === f.id && x.field === field)) {
      if (a.op === 'append') want.push(a.to);
      else {
        const i = want.indexOf(a.from ?? '');
        if (i < 0) failures.push(`${f.id}.${field}: the amendment "${a.why}" did not find its line`);
        else want[i] = a.to;
      }
      used.add(a);
    }
    const got = target.intent[field];
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${f.id}.${field}: differs from features.json beyond the declared amendments`);
    lines += f[field].length;
    verbatim += f[field].filter((line) => got.includes(line)).length;
  }
}
for (const a of AMENDMENTS) if (!used.has(a)) failures.push(`amendment for ${a.feature}.${a.field} was not applied`);

console.log(`Mapping check: ${source} → manifest/features/ (${manifest.length} features)`);
console.log(`  ids:      ${oldIds.length - failures.filter((x) => x.includes('expected exactly 1')).length} of ${oldIds.length} features.json ids map to exactly one manifest feature; same order: ${sameOrder ? 'yes' : 'NO'}`);
console.log(`  titles:   ${titles} of ${old.length} in intent.title, verbatim or as a declared amendment`);
console.log(`  lines:    ${verbatim} of ${lines} steps and expected lines verbatim in intent; the others are the declared amendments:`);
for (const a of AMENDMENTS) {
  console.log(`    - ${a.feature}.${a.field} ${a.op === 'append' ? 'gains one line' : 'replaces one line'}: ${a.why}`);
}
if (failures.length > 0) {
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(`Mapping check FAILED (${failures.length} problems).`);
  process.exit(1);
}
console.log('Mapping check PASSED.');
