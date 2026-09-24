// npm run manifest:check [-- --plant <id> | --list-plants]
// Validates manifest/ and the i18n catalogues. Exits 1 on any problem.
import { checkManifest, type ManifestSummary, type Problem } from '../../src/manifest/check.ts';
import { loadManifest } from './load.ts';
import { PLANTS, planted } from './plants.ts';

function printProblems(problems: Problem[]): void {
  for (const p of problems) {
    const where = p.path === '' ? p.file : `${p.file} › ${p.path}`;
    console.log(`✗ [${p.rule}] ${where}: ${p.message}`);
  }
}

function printSummary(s: ManifestSummary): void {
  const kinds = Object.entries(s.doorsByKind).map(([kind, n]) => `${kind} ${n}`).join(', ');
  console.log(`  features     ${s.features} in ${s.featureGroups} groups; status: ${s.features} of ${s.features} missing (status comes only from the runner, which does not exist yet)`);
  console.log(`  commands     ${s.commands}`);
  console.log(`  doors        ${s.doors}: ${kinds}`);
  console.log(`  elements     ${s.elements} types, ${s.paletteEntries} palette entries, ${s.attributes} attributes`);
  console.log(`  properties   ${s.properties}`);
  console.log(`  interactions ${s.keyContexts} key contexts, ${s.constants} constants, ${s.gestures} gestures`);
  console.log(`  scenarios    ${s.scenarios}`);
  console.log(`  i18n         ${s.i18nKeys} referenced keys, each present in every locale`);
}

const args = process.argv.slice(2);
if (args.includes('--list-plants')) {
  for (const plant of PLANTS) console.log(`${plant.id.padEnd(34)} [${plant.rule}] ${plant.description}`);
  process.exit(0);
}

const loaded = loadManifest();
let input = loaded.input;
const plantAt = args.indexOf('--plant');
if (plantAt >= 0) {
  const id = args[plantAt + 1];
  const plant = PLANTS.find((p) => p.id === id);
  if (!plant) {
    console.log(`unknown plant "${id ?? ''}"; run with --list-plants`);
    process.exit(2);
  }
  console.log(`planted fixture "${plant.id}": ${plant.description} (expected rule: ${plant.rule})`);
  input = planted(input, plant);
}

const result = checkManifest(input);
const problems = [...loaded.problems, ...result.problems];
console.log(`manifest:check: ${Object.keys(input.files).length} manifest files, catalogues ${Object.keys(input.catalogues).join(', ')}`);
if (problems.length > 0) {
  printProblems(problems);
  console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}. manifest:check FAILED.`);
  process.exit(1);
}
if (result.summary) printSummary(result.summary);
console.log('manifest:check passed.');
