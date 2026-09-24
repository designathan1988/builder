// npm run design:shots
// Renders design/final/index.html in the installed Chrome, writes design/final/shots/*.png and checks every
// screenshot: no text clipped or overflowing its box (in English and in pt-BR), pointer targets of 24 px or
// spaced as WCAG 2.2 criterion 2.5.8 allows, no console error, no canvas label over page content, every
// control drawn is a manifest door placed in the region it is drawn in (menu buttons in an anchor region
// of their menu), and every text marked with an i18n key is that key's English text. It also reports the
// canvas width of the default view. Exits 1 on any finding.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadManifest, REPO_ROOT } from '../manifest/load.ts';

interface Shot {
  file: string;
  width: number;
  height: number;
  hash: string;
}

const STATES = ['default', 'hover', 'selection', 'drag', 'multi', 'breakpoint', 'state', 'text', 'interaction', 'palette', 'menu', 'context'];
const SHOTS: Shot[] = [
  ...STATES.map((state, i) => ({ file: `1440-${String(i + 1).padStart(2, '0')}-${state}.png`, width: 1440, height: 900, hash: `state=${state}` })),
  { file: '1440-13-split.png', width: 1440, height: 900, hash: 'state=default&view=split' },
  { file: '1440-01-default-pt-BR.png', width: 1440, height: 900, hash: 'state=default&lang=pt-BR' },
  { file: '1440-01-default-dark.png', width: 1440, height: 900, hash: 'state=default&theme=dark' },
  { file: '1920-01-default.png', width: 1920, height: 1080, hash: 'state=default' },
];
const OUT = 'design/final/shots';
const PAGE = 'design/final/index.html';

const TYPES: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const file = path.join(REPO_ROOT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (!file.startsWith(REPO_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/${PAGE}`, close: () => server.close() });
    });
  });
}

// Door references and placements, and the anchor regions of each menu, from the manifest.
function manifestPlaces() {
  const { input } = loadManifest();
  const doors: Record<string, { region: string | null }> = {};
  const orders: Record<string, number> = {};
  for (const [file, data] of Object.entries(input.files)) {
    if (!file.startsWith('commands/')) continue;
    for (const c of (data as { commands: { id: string; entryPoints: { id: string; placement: unknown }[] }[] }).commands) {
      for (const d of c.entryPoints) {
        const p = d.placement as { region?: string } | string;
        doors[`${c.id}#${d.id}`] = { region: typeof p === 'object' && p.region ? p.region : null };
        if (typeof p === 'object') orders[`${c.id}#${d.id}`] = (p as { order: number }).order;
      }
    }
  }
  const layout = input.files['layout.json'] as { regions: { id: string; area: string }[]; menus: { id: string; anchors: { region: string }[] }[] };
  const components = layout.regions.filter((r) => r.area === 'component').map((r) => r.id);
  const menus = Object.fromEntries(layout.menus.map((m) => [m.id, m.anchors.map((a) => a.region)]));
  const en = input.catalogues.en as Record<string, string>;
  return { doors, orders, components, menus, en };
}

// Runs in the page: every finding of one rendered state.
function inspect(data: ReturnType<typeof manifestPlaces> & { lang: string }) {
  const findings: string[] = [];
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const name = (el: Element) => {
    const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}> "${t}"`;
  };
  const inMock = (el: Element) => el.closest('.mock-ctl') !== null;
  const inPage = (el: Element) => el.closest('.site') !== null && el.closest('.ov, .qp') === null;

  // 1. text clipped by its box or by a clipping ancestor
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || (node.textContent ?? '').trim() === '' || inMock(parent) || inPage(parent) || !visible(parent)) continue;
    if (parent.closest('svg, [hidden]')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    for (const r of rects) {
      for (let el: Element | null = parent; el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible' || el === parent;
        if (!clips) continue;
        // a scroll container shows the rest of its content by scrolling: content past its edge is not clipped
        const scrollsX = s.overflowX === 'auto' || s.overflowX === 'scroll';
        const scrollsY = s.overflowY === 'auto' || s.overflowY === 'scroll';
        const b = el.getBoundingClientRect();
        if ((!scrollsX && (r.left < b.left - 1 || r.right > b.right + 1)) || (!scrollsY && (r.top < b.top - 2 || r.bottom > b.bottom + 2))) {
          findings.push(`clipped text ${JSON.stringify((node.textContent ?? '').trim().slice(0, 40))} in ${name(parent)}: text ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)} outside ${name(el).slice(0, 60)} ${Math.round(b.left)}–${Math.round(b.right)} × ${Math.round(b.top)}–${Math.round(b.bottom)}`);
          break;
        }
      }
    }
  }
  // text wider than a box that clips it without showing it (scrollWidth)
  for (const el of document.querySelectorAll('body *')) {
    if (inMock(el) || inPage(el) || !visible(el) || el.closest('svg')) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) {
      findings.push(`text wider than its box: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    }
  }

  // 2. pointer targets: 24 × 24 px, or spaced so a 24 px circle on each touches no other target (WCAG 2.2, 2.5.8)
  const targets = [...document.querySelectorAll('button, a[href], input, select, [role="tab"], [role="menuitem"], [data-door], [data-menu], [data-local]')]
    .filter((el) => !inMock(el) && !inPage(el) && visible(el) && el.closest('[hidden]') === null)
    .filter((el) => !el.closest('.code') || el.classList.contains('code'));
  const boxes = targets.map((el) => ({ el, r: el.getBoundingClientRect() }));
  const small = boxes.filter((b) => b.r.width < 23.5 || b.r.height < 23.5);
  // a small target nested in another target is not exempt: its 24 px circle must still touch no other target
  for (const s of small) {
    const cx = s.r.left + s.r.width / 2;
    const cy = s.r.top + s.r.height / 2;
    for (const o of boxes) {
      if (o === s || s.el.contains(o.el)) continue;
      const nx = Math.max(o.r.left, Math.min(cx, o.r.right));
      const ny = Math.max(o.r.top, Math.min(cy, o.r.bottom));
      const circleHitsRect = Math.hypot(nx - cx, ny - cy) < 12;
      const oSmall = o.r.width < 23.5 || o.r.height < 23.5;
      const circles = oSmall && Math.hypot(o.r.left + o.r.width / 2 - cx, o.r.top + o.r.height / 2 - cy) < 24;
      if (circleHitsRect || circles) {
        findings.push(`target ${name(s.el)} is ${Math.round(s.r.width)} × ${Math.round(s.r.height)} and too close to ${name(o.el)}`);
        break;
      }
    }
  }

  // 3. canvas labels never cover page content (text, images, buttons of the page)
  const content: DOMRect[] = [];
  const site = document.getElementById('site');
  if (site) {
    const tw = document.createTreeWalker(site, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      const p = node.parentElement;
      if (!p || p.closest('.ov, .qp') || (node.textContent ?? '').trim() === '' || !visible(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      content.push(...[...range.getClientRects()].filter((r) => r.width > 0));
    }
    for (const el of site.querySelectorAll('.s-card-img, .s-hero-img')) if (visible(el)) content.push(el.getBoundingClientRect());
  }
  const labels = [...document.querySelectorAll('[data-label]')].filter((el) => visible(el) && el.closest('[hidden]') === null);
  for (const label of labels) {
    const l = label.getBoundingClientRect();
    for (const c of content) {
      const w = Math.min(l.right, c.right) - Math.max(l.left, c.left);
      const h = Math.min(l.bottom, c.bottom) - Math.max(l.top, c.top);
      if (w > 0.5 && h > 0.5) {
        findings.push(`canvas label ${name(label)} covers page content at ${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.width)}×${Math.round(c.height)}`);
        break;
      }
    }
  }

  // 4a. every control drawn is a door, a menu's button, or a control that is not a command (data-local)
  for (const el of document.querySelectorAll('button, [role="tab"], .mi, .pal-i, .row:not(.static)')) {
    if (inMock(el) || el.closest('[hidden]') !== null || !visible(el)) continue;
    if (el.closest('[data-door], [data-menu], [data-local]') === null) findings.push(`control without a door: ${name(el)}`);
  }
  // 4b. inside each region, the doors follow their order (each door's first appearance)
  const firstSeen = new Map<string, number[]>();
  const seenRefs = new Set<string>();
  for (const el of document.querySelectorAll('[data-door]')) {
    if (el.closest('[hidden]') !== null) continue;
    const ref = el.getAttribute('data-door') ?? '';
    const door = data.doors[ref];
    if (!door || door.region === null || data.components.includes(door.region) || seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    const list = firstSeen.get(door.region) ?? [];
    list.push(data.orders[ref] ?? 0);
    firstSeen.set(door.region, list);
    if (list.length > 1 && (list.at(-1) ?? 0) < (list.at(-2) ?? 0)) findings.push(`${ref} (order ${list.at(-1)}) is drawn after order ${list.at(-2)} in ${door.region}`);
  }
  // 4. every control drawn is a door of the manifest, in the region the manifest places it
  for (const el of document.querySelectorAll('[data-door]')) {
    if (el.closest('[hidden]') !== null) continue;
    const ref = el.getAttribute('data-door') ?? '';
    const door = data.doors[ref];
    if (!door) {
      findings.push(`${ref}: no such door in the manifest`);
      continue;
    }
    const region = el.closest('[data-region]')?.getAttribute('data-region') ?? null;
    const regions = [...(function* up(x: Element | null) { for (; x; x = x.parentElement?.closest('[data-region]') ?? null) yield x.getAttribute('data-region'); })(el.closest('[data-region]'))];
    if (door.region === null) findings.push(`${ref} has no placement but is drawn as a control`);
    else if (!regions.includes(door.region) && !(data.components.includes(door.region) && region !== null)) findings.push(`${ref} is placed in ${door.region} but drawn in ${regions.join(' < ') || 'no region'}`);
  }
  for (const el of document.querySelectorAll('[data-menu]')) {
    if (el.closest('[hidden]') !== null) continue;
    const menu = el.getAttribute('data-menu') ?? '';
    const anchors = data.menus[menu];
    const region = el.closest('[data-region]')?.getAttribute('data-region') ?? '';
    if (!anchors) findings.push(`menu ${menu}: not in layout.json`);
    else if (!anchors.includes(region)) findings.push(`menu ${menu} opens from ${region}, not from one of its anchors ${anchors.join(', ')}`);
  }

  // 5. text marked with an i18n key is that key's English text (checked in English only)
  if (data.lang === 'en') {
    for (const el of document.querySelectorAll('[data-t]')) {
      const key = el.getAttribute('data-t') ?? '';
      const text = data.en[key];
      if (text === undefined) {
        findings.push(`i18n key ${key} is not in en.json`);
        continue;
      }
      const params: Record<string, string> = JSON.parse(el.getAttribute('data-p') ?? '{}');
      const expected = text.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
      const own = el.children.length === 0 ? (el.textContent ?? '') : ([...el.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')?.textContent ?? '');
      if (own.trim().replace(/\s+/g, ' ') !== expected.trim()) findings.push(`${key}: drawn "${own.trim()}", en.json says "${expected}"`);
    }
    for (const el of document.querySelectorAll('[data-tt]')) {
      const key = el.getAttribute('data-tt') ?? '';
      if (data.en[key] === undefined) findings.push(`i18n key ${key} (tooltip) is not in en.json`);
    }
  }

  const centre = document.querySelector('.center')?.getBoundingClientRect().width ?? 0;
  const stage = document.querySelector('.stagewrap')?.getBoundingClientRect().width ?? 0;
  const doorCount = new Set([...document.querySelectorAll('[data-door]')].filter((el) => el.closest('[hidden]') === null).map((el) => el.getAttribute('data-door'))).size;
  return { findings, centre, stage, targets: targets.length, labels: labels.length, doorCount };
}

async function shoot(page: Page, url: string, shot: Shot, data: ReturnType<typeof manifestPlaces>) {
  const errors: string[] = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.goto(`${url}#${shot.hash}&shot=1`);
  await page.waitForSelector('body[data-ready="yes"]');
  await page.evaluate(() => document.fonts.ready);
  const lang = new URLSearchParams(shot.hash).get('lang') ?? 'en';
  const result = await page.evaluate(inspect, { ...data, lang });
  await page.screenshot({ path: path.join(REPO_ROOT, OUT, shot.file) });
  return { ...result, findings: [...errors, ...result.findings] };
}

const data = manifestPlaces();
const { url, close } = await serve();
fs.mkdirSync(path.join(REPO_ROOT, OUT), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
let total = 0;
for (const shot of SHOTS) {
  const r = await shoot(page, url, shot, data);
  total += r.findings.length;
  console.log(`${r.findings.length === 0 ? '✓' : '✗'} ${OUT}/${shot.file}: ${r.targets} targets, ${r.labels} canvas labels, ${r.doorCount} doors drawn, canvas area ${Math.round(r.centre)} px wide (stage ${Math.round(r.stage)} px), ${r.findings.length} findings`);
  for (const f of r.findings) console.log(`    - ${f}`);
}
await browser.close();
close();
console.log(total === 0 ? `design:shots: ${SHOTS.length} screenshots, 0 findings.` : `design:shots FAILED: ${total} findings.`);
process.exit(total === 0 ? 0 : 1);
