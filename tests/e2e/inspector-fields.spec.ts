// An inspector field is drawn as its door says (drawnAs of the inspector-field door): a button for an editor's action
// (Add a shadow, Reverse the gradient) or a fixed value (Spread), otherwise its property's control (a value field, a
// menu, keyword buttons). Read from the manifest and checked on every field the inspector draws in Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const DRAWN = new Map<string, string>();
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: { id: string; kind: string; drawnAs?: string }[] }[] };
  for (const c of commands) for (const d of c.entryPoints) if (d.kind === 'inspector-field' && d.drawnAs !== undefined) DRAWN.set(`${c.id}#${d.id}`, d.drawnAs);
}

test('every inspector field on screen is a button exactly when its door is drawn as one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const rows = await page.locator('.inspector .field-row[data-door]').evaluateAll((els) =>
    els.map((el) => ({ ref: el.getAttribute('data-door') ?? '', button: el.querySelector(':scope > button.door--button') !== null })),
  );
  const drawn = rows.filter((r) => DRAWN.has(r.ref));
  // the Style tab draws its fields, among them editors' actions and fixed-value buttons
  expect(drawn.length).toBeGreaterThan(100);
  expect(drawn.filter((r) => DRAWN.get(r.ref) === 'button').length).toBeGreaterThan(3);
  expect(drawn.filter((r) => r.button !== (DRAWN.get(r.ref) === 'button')).map((r) => `${r.ref} drawn ${r.button ? 'as a button' : 'as a field'}`)).toEqual([]);
});
