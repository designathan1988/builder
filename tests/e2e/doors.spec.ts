// The face text of a door, in the installed Chrome: a door whose drawing shows a shorter text than its label (its
// faceLabelKey in the manifest: "+ Class" for Apply a class) shows that text, and keeps its label as its accessible
// name, in English and in Brazilian Portuguese.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';

interface Door {
  id: string;
  labelKey: string;
  faceLabelKey: string | null;
}
const faced: { ref: string; labelKey: string; faceLabelKey: string }[] = [];
for (const file of fs.readdirSync('manifest/commands')) {
  const { commands } = JSON.parse(fs.readFileSync(path.join('manifest/commands', file), 'utf8')) as { commands: { id: string; entryPoints: Door[] }[] };
  for (const c of commands) for (const d of c.entryPoints) if (d.faceLabelKey !== null) faced.push({ ref: `${c.id}#${d.id}`, labelKey: d.labelKey, faceLabelKey: d.faceLabelKey });
}
const catalogue = (locale: string) => JSON.parse(fs.readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')) as Record<string, string>;

test('a door with a face label shows its face text and keeps its label as its accessible name, in English and Portuguese', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  // the inspector's selector bar draws Apply a class: the check cannot pass on nothing
  await expect(page.locator('[data-door="classes.apply#inspector-class-add"]')).toHaveCount(1);
  for (const locale of ['en', 'pt-BR']) {
    if (locale === 'pt-BR') {
      await page.getByRole('button', { name: 'Language', exact: true }).click();
      await page.getByRole('menuitemradio', { name: 'Português (Brasil)', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    }
    const texts = catalogue(locale);
    let checked = 0;
    for (const door of faced) {
      const control = page.locator(`[data-door="${door.ref}"]`);
      if ((await control.count()) === 0) continue;
      await expect(control).toHaveText(texts[door.faceLabelKey] ?? '');
      await expect(control).toHaveAccessibleName(texts[door.labelKey] ?? '');
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  }
});
