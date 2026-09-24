// Reads manifest/ and the i18n catalogues from disk into the input checkManifest expects.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestInput, Problem } from '../../src/manifest/check.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CATALOGUE_DIR = 'src/i18n/locales';

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
    if (json !== undefined) files[rel] = json;
  }
  const catalogues: Record<string, unknown> = {};
  for (const full of jsonFiles(path.join(root, CATALOGUE_DIR))) {
    const json = read(full, `${CATALOGUE_DIR}/${path.basename(full)}`);
    if (json !== undefined) catalogues[path.basename(full, '.json')] = json;
  }
  return {
    input: { files, catalogues, fileExists: (repoPath) => fs.existsSync(path.join(root, repoPath)) },
    problems,
  };
}
