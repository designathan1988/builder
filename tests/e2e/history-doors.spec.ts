// Undo and Redo through every door a user can reach (spec undo-redo, "Trigger"): Ctrl+Z; Ctrl+Shift+Z and Ctrl+Y; the
// top bar's buttons; the Edit menu's items. Each undo restores the document and the selection from before its command,
// each redo the ones after it, read through the read-only test port; with nothing to undo or redo, a drawn door is
// disabled with its reason and a key reports it in the status bar, changing nothing. (The toast's Undo is tested in
// delete-element.spec.ts; the command bar's arrives with command-bar.)
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const DRAWN = ['history.undo#toolbar-top-bar', 'history.undo#menu-edit', 'history.redo#toolbar-top-bar', 'history.redo#menu-edit'];
const KEYS = ['history.undo#key-ctrl-z-in-global', 'history.redo#key-ctrl-shift-z-in-global', 'history.redo#key-ctrl-y-in-global'];
const UNDO = ['history.undo#key-ctrl-z-in-global', 'history.undo#toolbar-top-bar', 'history.undo#menu-edit'];
const REDO = ['history.redo#key-ctrl-shift-z-in-global', 'history.redo#key-ctrl-y-in-global', 'history.redo#toolbar-top-bar', 'history.redo#menu-edit'];
const REASON: Record<string, string> = { 'history.undo': 'Nothing to undo.', 'history.redo': 'Nothing to redo.' };
const reasonOf = (ref: string) => REASON[ref.split('#')[0] ?? ''] ?? '';
const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';

// what a door could change: the window's regions and the stored preferences
const snapshot = (page: Page) =>
  page.evaluate(() => ({
    regions: [...document.querySelectorAll('[data-region]')].map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.getAttribute('data-region')} ${r.x} ${r.y} ${r.width} ${r.height}`;
    }),
    stored: window.localStorage.getItem('preferences'),
  }));

interface Tree {
  readonly id: string;
  readonly name: string;
  readonly children: readonly Tree[];
}
// the page's tree as names, the selection as names, and the history's steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Tree }[] }; selection: () => string[]; history: () => { undoSteps: number; redoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const names = new Map<string, string>();
    const outline = (n: Tree): string => {
      names.set(n.id, n.name);
      return n.children.length === 0 ? n.name : `${n.name}(${n.children.map(outline).join(' ')})`;
    };
    const tree = outline(p.document().pages[0]?.tree as Tree);
    return { tree, selection: p.selection().map((id) => names.get(id) ?? id), history: p.history() };
  });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('with nothing to undo or redo, every Undo and Redo door says so and changes nothing', runs(...DRAWN, ...KEYS), async ({ page }) => {
  const before = await snapshot(page);
  for (const ref of DRAWN) {
    if (ref.includes('#menu-')) await openMenu(page, 'edit');
    const door = page.locator(`[data-door="${ref}"]`);
    await expect(door, ref).toHaveAttribute('aria-disabled', 'true');
    await expect(door, ref).toHaveAttribute('title', new RegExp(reasonOf(ref).replace('.', '\\.')));
    await door.click({ force: true });
    await page.keyboard.press('Escape');
    expect(await snapshot(page), ref).toEqual(before);
  }
  const status = page.getByRole('status');
  for (const ref of KEYS) {
    await runDoor(page, ref);
    await expect(status, ref).toHaveText(reasonOf(ref));
    expect(await snapshot(page), ref).toEqual(before);
  }
});

test('every Undo door restores the document and the selection before its command, every Redo door the ones after it', runs(INSERT_PANEL, TILE, ...UNDO, ...REDO), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  // a Section on the empty page, then a Heading inside it (the Section is selected, a container)
  await control(page, TILE, { args: { entry: 'section' } }).click();
  await control(page, TILE, { args: { entry: 'heading' } }).click();
  const inserted = { tree: 'Page(Section(Heading))', selection: ['Heading'], history: { undoSteps: 2, redoSteps: 0 } };
  const undone = { tree: 'Page(Section)', selection: ['Section'], history: { undoSteps: 1, redoSteps: 1 } };
  expect(await read(page)).toEqual(inserted);
  const status = page.getByRole('status');
  for (const [i, undo] of UNDO.entries()) {
    // the keys act in the global context and the contexts that inherit it (the focus rests on a tile, a button)
    await runDoor(page, undo);
    await expect.poll(() => read(page), undo).toEqual(undone);
    await expect(status, undo).toHaveText('Undone');
    // each Redo door in turn, the last two after the same undo
    const redo = REDO[i] ?? '';
    await runDoor(page, redo);
    await expect.poll(() => read(page), redo).toEqual(inserted);
    await expect(status, redo).toHaveText('Redone');
  }
  const last = REDO[REDO.length - 1] ?? '';
  await runDoor(page, UNDO[0] ?? '');
  await expect.poll(() => read(page)).toEqual(undone);
  await runDoor(page, last);
  await expect.poll(() => read(page), last).toEqual(inserted);

  // both steps back: the empty page and no selection, Undo disabled with its reason, Redo enabled
  await runDoor(page, 'history.undo#toolbar-top-bar');
  await runDoor(page, 'history.undo#toolbar-top-bar');
  expect(await read(page)).toEqual({ tree: 'Page', selection: [], history: { undoSteps: 0, redoSteps: 2 } });
  await expect(page.locator('[data-door="history.undo#toolbar-top-bar"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-door="history.redo#toolbar-top-bar"]')).not.toHaveAttribute('aria-disabled', 'true');
  // a new command after an undo empties the redo stack: Redo is disabled with its reason
  await control(page, TILE, { args: { entry: 'paragraph' } }).click();
  expect(await read(page)).toEqual({ tree: 'Page(Paragraph)', selection: ['Paragraph'], history: { undoSteps: 1, redoSteps: 0 } });
  await expect(page.locator('[data-door="history.redo#toolbar-top-bar"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-door="history.redo#toolbar-top-bar"]')).toHaveAttribute('title', /Nothing to redo\./);
});
