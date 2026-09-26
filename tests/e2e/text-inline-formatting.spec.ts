// text-inline-formatting beyond its scenarios (spec/behavior/text-inline-formatting.md): a mark toggled over part of a
// word applies to that part only, and toggled again over part of a bold run takes it off that part only (Problems in
// Pager 2); the text toolbar's Italic and Bold act on the selected text and keep the focus in it, the marks nest and
// survive a reload; Ctrl+K links the selected word, starts from the address of the link the caret is in, and an empty
// address removes the link; an address that is not allowed is refused and the link prompt stays open saying why
// (Problems in Pager 1), and its backdrop gives the typing back to the text; Ctrl+V pastes the clipboard's HTML keeping
// bold, italic and allowed links and dropping scripts (Problems in Pager 3); the inspector's text field keeps the marks
// of what it keeps; a clipboard the browser does not let the editor read is refused. Every key and click goes through
// its door; the document, the selection and the history are
// read through the read-only test port, the page through the frame, the saved work after a reload.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { control, openMenu, runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ENTER_EDIT = 'text.startEdit#key-enter-in-canvas';
const ENTER_KEEP = 'text.set#key-enter-in-text-editing';
const BOLD_KEY = 'text.toggleBold#key-ctrl-b-in-text-editing';
const BOLD_BUTTON = 'text.toggleBold#toolbar-text-toolbar-bold';
const ITALIC_BUTTON = 'text.toggleItalic#toolbar-text-toolbar-italic';
const LINK_KEY = 'text.editLink#key-ctrl-k-in-text-editing';
const LINK_BUTTON = 'text.editLink#toolbar-text-toolbar-link';
const PASTE_KEY = 'text.paste#key-ctrl-v-in-text-editing';
const BACKDROP = 'ui.dismiss#overlay-backdrop';
const UNDO = 'history.undo#toolbar-top-bar';
const SETTINGS = 'workspace.setActiveTab#inspector-tab-settings';
const TEXT_FIELD = 'text.set#inspector-text';
const ENTER_FIELD = 'text.set#key-enter-in-element-text-field';
const INTRO = 'Fresh coffee, roasted every week.';

interface Node {
  readonly id: string;
  readonly text: string | null;
  readonly inline?: unknown;
  readonly children: readonly Node[];
}
// the Intro node's text and marks, the selection and the undo steps, through the read-only test port
const read = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => { pages: { tree: Node }[] }; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    const find = (n: Node): Node | null => (n.id === 'n-intro' ? n : n.children.reduce<Node | null>((found, c) => found ?? find(c), null));
    const intro = find(p.document().pages[0]?.tree as Node);
    return { text: intro?.text ?? null, inline: intro?.inline ?? null, selection: p.selection(), undoSteps: p.history().undoSteps };
  });
const intro = (page: Page) => page.frameLocator('.frame__page').locator('[data-node="n-intro"]');
// what the page's Intro element holds: its text with the elements of its marks
const markup = (page: Page) => intro(page).evaluate((el) => el.innerHTML);
const status = (page: Page) => page.getByRole('status');
const field = (page: Page) => page.locator('[data-local="link-address"]');

async function openAurora(page: Page) {
  await openMenu(page, 'file');
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-door="${OPEN}"]`).click();
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(intro(page)).toHaveCount(1);
}

// Intro clicked on the canvas and edited with Enter: the caret at the end of its text
async function editIntro(page: Page) {
  const at = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const el = iframe?.contentDocument?.querySelector('[data-node="n-intro"]');
    if (!iframe || !el) throw new Error('the canvas does not draw Intro');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: frame.left + (r.left + r.width / 2) * zoom, y: frame.top + (r.top + r.height / 2) * zoom };
  });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await expect(intro(page)).toBeFocused();
}

// selects characters of the edited text with the keyboard: `length` of them, `from` characters after its start
async function selectChars(page: Page, from: number, length: number) {
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < from; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < length; i += 1) await page.keyboard.press('Shift+ArrowRight');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await openAurora(page);
});

test('Ctrl+B bolds part of a word only, and again over part of the bold takes it off that part only; Undo takes the marks back', runs(OPEN, SELECT, ENTER_EDIT, BOLD_KEY, ENTER_KEEP, UNDO), async ({ page }) => {
  await editIntro(page);
  // "week" (characters 28 to 32)
  await selectChars(page, 28, 4);
  await page.keyboard.press('Control+b');
  await expect.poll(() => markup(page)).toBe('Fresh coffee, roasted every <strong>week</strong>.');
  // the bold word stays selected; its last two letters, "ek", lose bold alone
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+b');
  await expect.poll(() => markup(page)).toBe('Fresh coffee, roasted every <strong>we</strong>ek.');
  expect(await read(page)).toEqual({ text: INTRO, inline: null, selection: ['n-intro'], undoSteps: 0 });
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ text: INTRO, inline: ['Fresh coffee, roasted every ', { tag: 'strong', children: ['we'] }, 'ek.'], selection: ['n-intro'], undoSteps: 1 });
  await expect.poll(() => markup(page)).toBe('Fresh coffee, roasted every <strong>we</strong>ek.');
  await runDoor(page, UNDO);
  await expect.poll(() => read(page)).toEqual({ text: INTRO, inline: null, selection: ['n-intro'], undoSteps: 0 });
  await expect.poll(() => markup(page)).toBe(INTRO);
});

test('the text toolbar’s Italic and Bold act on the selected text and keep the focus in it; the marks nest and survive a reload', runs(OPEN, SELECT, ENTER_EDIT, ITALIC_BUTTON, BOLD_BUTTON, ENTER_KEEP), async ({ page }) => {
  await editIntro(page);
  await selectChars(page, 0, 5);
  await runDoor(page, ITALIC_BUTTON);
  await expect.poll(() => markup(page)).toBe('<em>Fresh</em> coffee, roasted every week.');
  await expect(intro(page)).toBeFocused();
  await runDoor(page, BOLD_BUTTON);
  await expect.poll(() => markup(page)).toBe('<strong><em>Fresh</em></strong> coffee, roasted every week.');
  await expect(intro(page)).toBeFocused();
  await page.keyboard.press('Enter');
  const kept = { text: INTRO, inline: [{ tag: 'strong', children: [{ tag: 'em', children: ['Fresh'] }] }, ' coffee, roasted every week.'], selection: ['n-intro'], undoSteps: 1 };
  await expect.poll(() => read(page)).toEqual(kept);
  await page.reload();
  await expect(page.locator('.workbench')).toBeVisible();
  await expect.poll(() => read(page)).toEqual({ ...kept, undoSteps: 0 });
  await expect.poll(() => markup(page)).toBe('<strong><em>Fresh</em></strong> coffee, roasted every week.');
});

test('Ctrl+K links the selected word, starts from the address of the link the caret is in, and an empty address removes the link', runs(OPEN, SELECT, ENTER_EDIT, LINK_KEY, ENTER_KEEP), async ({ page }) => {
  await editIntro(page);
  // "coffee" (characters 6 to 12)
  await selectChars(page, 6, 6);
  await page.keyboard.press('Control+k');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('');
  await expect(status(page)).toHaveText('Type the link address, then press Enter. An empty address removes the link.');
  await page.keyboard.type('https://example.com\n');
  await expect(field(page)).toHaveCount(0);
  await expect(intro(page)).toBeFocused();
  await expect.poll(() => markup(page)).toBe('Fresh <a href="https://example.com">coffee</a>, roasted every week.');
  // the caret in the link: the prompt starts from its address, selected, so what is typed replaces it
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+k');
  await expect(field(page)).toHaveValue('https://example.com');
  await page.keyboard.type('mailto:hello@example.com\n');
  await expect.poll(() => markup(page)).toBe('Fresh <a href="mailto:hello@example.com">coffee</a>, roasted every week.');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ text: INTRO, inline: ['Fresh ', { tag: 'a', href: 'mailto:hello@example.com', children: ['coffee'] }, ', roasted every week.'], selection: ['n-intro'], undoSteps: 1 });
  // an empty address removes the link the caret is in
  await page.keyboard.press('Enter');
  await expect(intro(page)).toBeFocused();
  await selectChars(page, 8, 0);
  await page.keyboard.press('Control+k');
  await expect(field(page)).toHaveValue('mailto:hello@example.com');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect.poll(() => markup(page)).toBe(INTRO);
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ text: INTRO, inline: null, selection: ['n-intro'], undoSteps: 2 });
});

test('an address that is not allowed is refused: the prompt stays open saying why, nothing is written, and its backdrop gives the typing back to the text', runs(OPEN, SELECT, ENTER_EDIT, LINK_BUTTON, BACKDROP, ENTER_KEEP), async ({ page }) => {
  await editIntro(page);
  await runDoor(page, LINK_BUTTON);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('javascript:alert(1)\n');
  const refusal = 'Links must start with http, https, mailto or tel.';
  await expect(status(page)).toHaveText(refusal);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.link-prompt__hint')).toHaveText(refusal);
  expect(await markup(page)).toBe(INTRO);
  expect(await read(page)).toEqual({ text: INTRO, inline: null, selection: ['n-intro'], undoSteps: 0 });
  await runDoor(page, BACKDROP);
  await expect(field(page)).toHaveCount(0);
  await expect(intro(page)).toBeFocused();
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ text: `${INTRO}!`, inline: null, selection: ['n-intro'], undoSteps: 1 });
});

test('Ctrl+V pastes the clipboard’s HTML keeping bold, italic and allowed links, a heading on its own line, no script and no unsafe link', runs(OPEN, SELECT, ENTER_EDIT, PASTE_KEY, ENTER_KEEP), async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // the link's address is written in its canonical form (a path after the host): the browser serializes the addresses
  // of the HTML it puts on the clipboard, and "https://example.com" would come back as "https://example.com/" before
  // the editor ever reads it
  const html = '<h2>Heading</h2><p><b>RICH</b> <i>x</i> <a href="https://example.com/shop">ok</a> <a href="javascript:alert(1)">bad</a></p><script>alert(1)</script>';
  await page.evaluate(
    (h) => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([h], { type: 'text/html' }), 'text/plain': new Blob(['Heading RICH x ok bad'], { type: 'text/plain' }) })]),
    html,
  );
  try {
    await editIntro(page);
    await page.keyboard.press('Control+v');
    await expect.poll(() => markup(page)).toBe(`${INTRO}Heading<br><strong>RICH</strong> <em>x</em> <a href="https://example.com/shop">ok</a> bad`);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => read(page))
      .toEqual({
        text: `${INTRO}Heading\nRICH x ok bad`,
        inline: [`${INTRO}Heading\n`, { tag: 'strong', children: ['RICH'] }, ' ', { tag: 'em', children: ['x'] }, ' ', { tag: 'a', href: 'https://example.com/shop', children: ['ok'] }, ' bad'],
        selection: ['n-intro'],
        undoSteps: 1,
      });
  } finally {
    // the browser's clipboard outlives this test's context: nothing is left for another test to paste
    await page.evaluate(() => navigator.clipboard.writeText(''));
  }
});

test('the inspector’s text field keeps the marks of what it keeps: Enter with the text unchanged drops none, and text typed after a bold word leaves it bold', runs(OPEN, SELECT, ENTER_EDIT, BOLD_KEY, ENTER_KEEP, SETTINGS, TEXT_FIELD, ENTER_FIELD), async ({ page }) => {
  await editIntro(page);
  await selectChars(page, 0, 5);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Enter');
  const bold = [{ tag: 'strong', children: ['Fresh'] }, ' coffee, roasted every week.'];
  await expect.poll(() => read(page)).toEqual({ text: INTRO, inline: bold, selection: ['n-intro'], undoSteps: 1 });
  await runDoor(page, SETTINGS);
  const textField = control(page, TEXT_FIELD).locator('textarea');
  await expect(textField).toHaveValue(INTRO);
  await textField.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  expect(await read(page)).toEqual({ text: INTRO, inline: bold, selection: ['n-intro'], undoSteps: 1 });
  await expect.poll(() => markup(page)).toBe('<strong>Fresh</strong> coffee, roasted every week.');
  await page.keyboard.type(' Daily.');
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page)).toEqual({ text: `${INTRO} Daily.`, inline: [{ tag: 'strong', children: ['Fresh'] }, ' coffee, roasted every week. Daily.'], selection: ['n-intro'], undoSteps: 2 });
  await expect.poll(() => markup(page)).toBe('<strong>Fresh</strong> coffee, roasted every week. Daily.');
});

test('a clipboard the browser does not let the editor read is refused, and nothing changes', runs(OPEN, SELECT, ENTER_EDIT, PASTE_KEY), async ({ page }) => {
  await page.context().clearPermissions();
  await editIntro(page);
  await page.keyboard.press('Control+v');
  await expect(status(page)).toHaveText('The browser did not allow access to the clipboard.');
  expect(await markup(page)).toBe(INTRO);
  await expect(intro(page)).toBeFocused();
  expect(await read(page)).toEqual({ text: INTRO, inline: null, selection: ['n-intro'], undoSteps: 0 });
});
