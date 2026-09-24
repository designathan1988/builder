// The installed version of a package, read from its package.json. Some packages (@mdn/browser-compat-data)
// do not export package.json, so the file is found from the package's resolved entry point.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function packageVersion(pkg: string): string {
  let dir = path.dirname(require.resolve(pkg));
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string };
      if (json.name === pkg && json.version !== undefined) return json.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json found for ${pkg}`);
    dir = parent;
  }
}
