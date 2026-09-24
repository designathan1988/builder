// npm run gen:check (first step of verify:fast)
// Regenerates manifest/generated/, src/ui/tokens.css and src/generated/ and fails when git sees any difference: a generated
// file that was edited by hand, or is stale because a source (a package, design/final/tokens.json) changed,
// or was never added to git.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../manifest/load.ts';
import { GENERATED_DIR, generate } from './generate.ts';
import { TOKENS_CSS } from './tokens.ts';
import { TYPES_DIR } from './types.ts';
import { ICON_SPRITE } from './icons.ts';
import { packageVersion } from './versions.ts';
const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });

// the header names the package versions it was generated from; say which one moved
const stale: string[] = [];
for (const file of fs.readdirSync(path.join(REPO_ROOT, GENERATED_DIR))) {
  const header = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GENERATED_DIR, file), 'utf8')) as { $generated?: { from?: Record<string, string> } }).$generated;
  for (const [pkg, version] of Object.entries(header?.from ?? {})) {
    const installed = packageVersion(pkg);
    if (installed !== version) stale.push(`${file} was generated from ${pkg} ${version}; ${installed} is installed`);
  }
}

const written = await generate();
// a file in src/generated/ that the generator does not write is hand-made, even when it is committed
const handMade = fs
  .readdirSync(path.join(REPO_ROOT, TYPES_DIR))
  .map((f) => `${TYPES_DIR}/${f}`)
  .filter((f) => !written.includes(f));
const untracked = git('ls-files', '--others', '--exclude-standard', '--', GENERATED_DIR, TOKENS_CSS, TYPES_DIR, ICON_SPRITE).trim();
const diff = git('diff', '--stat', '--', GENERATED_DIR, TOKENS_CSS, TYPES_DIR, ICON_SPRITE).trim();
if (untracked === '' && diff === '' && handMade.length === 0) {
  console.log(`gen:check: ${written.join(', ')} are up to date.`);
  process.exit(0);
}
for (const line of stale) console.log(`✗ ${line}`);
if (untracked !== '') console.log(`✗ not added to git:\n${untracked}`);
if (diff !== '') console.log(`✗ npm run gen changed:\n${diff}`);
for (const f of handMade) console.log(`✗ ${f} is not written by npm run gen: src/generated/ holds only generated files`);
console.log('gen:check FAILED: generated files are never edited by hand. Review the regenerated files, then add and commit them.');
process.exit(1);
