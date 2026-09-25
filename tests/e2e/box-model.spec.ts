// The box model of the inspector is drawn from the data: every composite drawn as a box model (properties.json control
// box-model) is a box, each around the next in the placement order of its door, and the field of each longhand sits
// on the side its index in the composite's longhands names (the shorthand's order: top, right, bottom, left),
// between the box's edge and the box inside it. Checked on the geometry Chrome lays out.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

interface Composite {
  readonly id: string;
  readonly control: string;
  readonly longhands: readonly string[];
}
interface Door {
  readonly id: string;
  readonly kind: string;
  readonly property?: string | null;
  readonly composite?: string | null;
  readonly control?: string;
  readonly placement: { readonly order: number } | string;
}
const COMPOSITES = (JSON.parse(fs.readFileSync('manifest/properties.json', 'utf8')) as { composites: Composite[] }).composites.filter((c) => c.control === 'box-model');
const FIELDS: { ref: string; door: Door }[] = [];
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: Door[] }[] };
  for (const c of commands) for (const d of c.entryPoints) if (d.kind === 'inspector-field' && d.control === 'box-model') FIELDS.push({ ref: `${c.id}#${d.id}`, door: d });
}
const order = (d: Door) => (typeof d.placement === 'object' ? d.placement.order : 0);
// the boxes, outermost first: the composites' doors in placement order
const BOXES = FIELDS.filter((f) => COMPOSITES.some((c) => c.id === f.door.composite)).sort((a, b) => order(a.door) - order(b.door));

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not laid out`);
  return found;
};

test('each box of the box model holds the next, and each side field sits on its side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  expect(BOXES.length).toBe(COMPOSITES.length);
  expect(BOXES.length).toBeGreaterThan(1);

  const outline = (ref: string) => box(page, `.box:has(> [data-door="${ref}"])`);
  for (const [level, b] of BOXES.entries()) {
    const composite = COMPOSITES.find((c) => c.id === b.door.composite);
    if (composite === undefined) throw new Error(`no composite for ${b.ref}`);
    const outer = await outline(b.ref);
    const next = BOXES[level + 1];
    const inner = next !== undefined ? await outline(next.ref) : await box(page, `.box:has(> [data-door="${b.ref}"]) > .box__core`);
    // the next box lies inside this one
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);
    for (const [i, where] of SIDES.entries()) {
      const field = FIELDS.find((f) => f.door.property === composite.longhands[i]);
      if (field === undefined) throw new Error(`no field for ${composite.longhands[i]}`);
      const at = await box(page, `.box:has(> [data-door="${b.ref}"]) > [data-door="${field.ref}"]`);
      const cx = at.x + at.width / 2;
      const cy = at.y + at.height / 2;
      const where_ = `${field.ref} on the ${where} of ${b.ref}`;
      if (where === 'top') expect(at.y + at.height, where_).toBeLessThanOrEqual(inner.y + 1);
      if (where === 'bottom') expect(at.y, where_).toBeGreaterThanOrEqual(inner.y + inner.height - 1);
      if (where === 'left') expect(at.x + at.width, where_).toBeLessThanOrEqual(inner.x + 1);
      if (where === 'right') expect(at.x, where_).toBeGreaterThanOrEqual(inner.x + inner.width - 1);
      if (where === 'top' || where === 'bottom') expect(cx > inner.x && cx < inner.x + inner.width, where_).toBe(true);
      if (where === 'left' || where === 'right') expect(cy > inner.y && cy < inner.y + inner.height, where_).toBe(true);
    }
  }
});
