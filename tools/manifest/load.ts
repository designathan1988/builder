// Reads manifest/ and the i18n catalogues from disk into the input checkManifest expects.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestInput, Problem, ReferenceKind } from '../../src/manifest/check.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CATALOGUE_DIR = 'src/i18n/locales';
export const GLOSSARY_FILE = 'src/i18n/glossary.json';
export const ARCHITECTURE_FILE = 'ARCHITECTURE.md';

export interface LoadedManifest {
  input: ManifestInput;
  // files that are not valid JSON never reach the schema check
  problems: Problem[];
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

// Code registers what the manifest names by id with registerHandler('<id>', ...),
// registerPredicate, registerAction or registerCodec. The ids found under src/ are "registered".
const REGISTER = /\bregister(Handler|Predicate|Action|Codec)\(\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

export function registeredIds(root: string = REPO_ROOT): Record<ReferenceKind, string[]> {
  const out: Record<ReferenceKind, string[]> = { handler: [], predicate: [], action: [], codec: [] };
  for (const file of sourceFiles(path.join(root, 'src'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(REGISTER)) {
      const kind = (match[1] ?? '').toLowerCase() as ReferenceKind;
      const id = match[2] ?? '';
      if (!out[kind].includes(id)) out[kind].push(id);
    }
  }
  return out;
}

// The generated web data (css-compat.json alone is 6.7 MB) is read once and frozen, so every check and every
// planted fixture shares it: nothing can change it in place, and checkManifest parses each frozen file once.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function loadManifest(root: string = REPO_ROOT): LoadedManifest {
  const problems: Problem[] = [];
  const read = (full: string, label: string): unknown => {
    try {
      return JSON.parse(fs.readFileSync(full, 'utf8')) as unknown;
    } catch (error) {
      problems.push({ rule: 'schema', file: label, path: '', message: `not valid JSON: ${(error as Error).message}` });
      return undefined;
    }
  };
  const manifestDir = path.join(root, 'manifest');
  const files: Record<string, unknown> = {};
  for (const full of jsonFiles(manifestDir)) {
    const rel = path.relative(manifestDir, full).split(path.sep).join('/');
    const json = read(full, rel);
    if (json !== undefined) files[rel] = rel.startsWith('generated/') ? deepFreeze(json) : json;
  }
  const catalogues: Record<string, unknown> = {};
  for (const full of jsonFiles(path.join(root, CATALOGUE_DIR))) {
    const json = read(full, `${CATALOGUE_DIR}/${path.basename(full)}`);
    if (json !== undefined) catalogues[path.basename(full, '.json')] = json;
  }
  const glossaryPath = path.join(root, GLOSSARY_FILE);
  const glossary = fs.existsSync(glossaryPath) ? read(glossaryPath, GLOSSARY_FILE) : undefined;
  const architecturePath = path.join(root, ARCHITECTURE_FILE);
  const architecture = fs.existsSync(architecturePath) ? fs.readFileSync(architecturePath, 'utf8') : null;
  return {
    input: { files, catalogues, glossary, fileExists: (repoPath) => fs.existsSync(path.join(root, repoPath)), registered: registeredIds(root), architecture },
    problems,
  };
}
