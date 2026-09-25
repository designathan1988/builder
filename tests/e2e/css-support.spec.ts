// The browser is the truth: every keyword, value and unit a door offers (the generated lists, the presets, Essentials
// only and the quick panel's lists) is accepted by the installed Chrome's own parser, CSS.supports. A value Chrome
// refuses leaves the lists through manifest/css-exclusions.json, with this test as its evidence.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../support/test.ts';
import { GENERATED_VALUES } from '../../src/generated/value-lists.ts';

interface Subset {
  id: string;
  values: string[] | null;
  units: string[] | null;
}
interface Offers {
  property: string;
  list: string;
  presets: string | null;
  essentials: string | null;
}
const properties = JSON.parse(fs.readFileSync('manifest/properties.json', 'utf8')) as {
  properties: { id: string; subsets: Subset[] }[];
  composites: { id: string; subsets: Subset[] }[];
  recipes: { id: string; declarations: { property: string; value: string | null }[] }[];
};
const subsets = new Map<string, Subset[]>([...properties.properties, ...properties.composites].map((p) => [p.id, p.subsets]));
// the CSS properties a value is written to: a property or composite's own name, a recipe's declarations that carry it
const targets = new Map<string, string[]>(properties.recipes.map((r) => [r.id, r.declarations.filter((d) => d.value === null).map((d) => d.property)]));

// every door's offered keywords, values and units, by the CSS properties they are written to
const offered = new Map<string, { names: string[]; values: Set<string>; units: Set<string> }>();
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { entryPoints: { adapter: { offers: Offers | null } }[] }[] };
  for (const door of commands.flatMap((c) => c.entryPoints)) {
    const offers = door.adapter.offers;
    if (!offers) continue;
    const entry = offered.get(offers.property) ?? { names: targets.get(offers.property) ?? [offers.property], values: new Set<string>(), units: new Set<string>() };
    const lists: (Subset | undefined)[] = [offers.presets, offers.essentials, offers.list === 'generated' ? null : offers.list].map((id) => (id === null ? undefined : subsets.get(offers.property)?.find((s) => s.id === id)));
    if (offers.list === 'generated') {
      const generated = GENERATED_VALUES[offers.property as keyof typeof GENERATED_VALUES];
      for (const k of generated?.keywords ?? []) entry.values.add(k);
      for (const u of generated?.units ?? []) entry.units.add(u);
    }
    for (const list of lists) {
      for (const v of list?.values ?? []) entry.values.add(v);
      for (const u of list?.units ?? []) entry.units.add(u);
    }
    offered.set(offers.property, entry);
  }
}
const checks = [...offered.entries()].map(([id, e]) => ({ id, names: e.names, values: [...e.values], units: [...e.units] }));

test('Chrome accepts every keyword, value and unit a door offers (CSS.supports)', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate((all) => {
    const refused: string[] = [];
    let values = 0;
    let units = 0;
    for (const c of all) {
      // a value works when Chrome accepts it for one of the properties it is written to
      const supports = (value: string) => c.names.some((name) => CSS.supports(name, value));
      for (const v of c.values) {
        values += 1;
        if (!supports(v)) refused.push(`${c.id}: ${v}`);
      }
      for (const u of c.units) {
        units += 1;
        const forms = [`1${u}`, `1${u} 1${u}`, `1${u} 1${u} 1${u}`, `0 0 1${u}`, `1${u} ease`, `all 1${u}`];
        if (!forms.some(supports)) refused.push(`${c.id}: the unit ${u}`);
      }
    }
    return { refused, values, units, properties: all.length };
  }, checks);
  console.log(`checked ${result.values} values and ${result.units} units of ${result.properties} properties in Chrome; refused: ${result.refused.length}`);
  expect(result.values).toBeGreaterThan(1000);
  expect(result.refused).toEqual([]);
});
