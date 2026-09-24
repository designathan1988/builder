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
  field: 'steps' | 'expected';
  op: 'append' | 'replace';
  from?: string;
  to: string;
  why: string;
}

// The three points the last review left open: no older saved format exists; one meaning per modifier
// while resizing (Alt from the centre, Ctrl suspends snapping); an opened folder's stylesheets are parsed
// into the document and the original .css files stay as ordinary, unlinked files.
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
  if (target.intent.title === f.title) titles++;
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
console.log(`  titles:   ${titles} of ${old.length} verbatim in intent.title`);
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
