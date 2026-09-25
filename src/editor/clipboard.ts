// The system clipboard (ARCHITECTURE.md): the one reader of the browser's clipboard. A command that takes what the
// clipboard holds (an argument of type "clipboard" in the manifest: text.paste) runs once its door has read it here,
// with its content as data (ClipboardContent): its HTML as a tree of texts and elements (parsed into an inert document
// that runs nothing), its plain text, or the browser's refusal. The command decides what to make of it; this module
// keeps nothing.
import type { ClipboardContent, ClipboardNode } from '../generated/commands.ts';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// the texts and elements of a parsed document's body, each element with its tag, its href and its children
function nodesOf(parent: Node): ClipboardNode[] {
  const out: ClipboardNode[] = [];
  for (const child of parent.childNodes) {
    if (child.nodeType === TEXT_NODE) out.push(child.nodeValue ?? '');
    else if (child.nodeType === ELEMENT_NODE) {
      const element = child as Element;
      out.push({ tag: element.localName, href: element.getAttribute('href'), children: nodesOf(element.localName === 'template' ? (element as HTMLTemplateElement).content : element) });
    }
  }
  return out;
}

async function textOf(item: ClipboardItem, type: string): Promise<string | null> {
  if (!item.types.includes(type)) return null;
  const text = await (await item.getType(type)).text();
  return text === '' ? null : text;
}

// What the system clipboard holds now. The browser asks the person once whether the editor may read it; refused,
// the content says so. An empty clipboard, or one holding neither HTML nor text, holds nothing.
export async function readClipboard(): Promise<ClipboardContent> {
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') return { status: 'denied' };
    return { status: 'read', html: null, text: null };
  }
  let html: string | null = null;
  let text: string | null = null;
  for (const item of items) {
    html ??= await textOf(item, 'text/html');
    text ??= await textOf(item, 'text/plain');
  }
  return { status: 'read', html: html === null ? null : nodesOf(new DOMParser().parseFromString(html, 'text/html').body), text };
}
