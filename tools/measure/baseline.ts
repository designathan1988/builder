// The validated state every measured change starts from (tools/measure/scenarios.ts, tools/measure/bugs.ts): the
// browser tests' dependency map and the static checks' ledger of one validated tree, saved beside them.
//
//   node tools/measure/baseline.ts --save    after npm run check passed on a clean tree
import fs from 'node:fs';
import { MAP_FILE } from '../impact/impact.ts';
import { STATICS_FILE } from '../impact/statics.ts';

const FILES = [MAP_FILE, STATICS_FILE];
const saved = (file: string) => file.replace(/\.json$/, '.baseline.json');

export function restoreBaseline(): void {
  for (const f of FILES) {
    if (!fs.existsSync(saved(f))) throw new Error(`${saved(f)} is missing: run npm run check on a clean tree, then node tools/measure/baseline.ts --save`);
    fs.copyFileSync(saved(f), f);
  }
}

if (import.meta.main) {
  if (!process.argv.includes('--save')) throw new Error('usage: node tools/measure/baseline.ts --save');
  for (const f of FILES) fs.copyFileSync(f, saved(f));
  console.log(`saved ${FILES.map(saved).join(', ')}`);
}
