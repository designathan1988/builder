// ZIP archives (ARCHITECTURE.md): the one writer of the archives the editor hands out (File › Save project's
// project.zip; the export's ZIP), and the reader of the archives it is given (File › Open). Standard ZIP (APPNOTE
// 6.3): each entry written stored without compression, its name in UTF-8 (general purpose flag 11), its CRC-32 and
// its modification time, so the same entries at the same time always give the same bytes; an entry read stored or
// deflated (as any ZIP tool writes it), its size and CRC-32 checked. No DOM, no clock (the caller passes the time,
// from the clock port).

export interface ZipEntry {
  // the entry's path inside the archive, with "/" between folders
  readonly path: string;
  readonly bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A time in milliseconds as MS-DOS date and time fields (2-second resolution, from 1980), in UTC so the same moment
// gives the same bytes wherever the archive is written.
function dosTime(ms: number): { readonly time: number; readonly date: number } {
  const at = new Date(Math.max(ms, Date.UTC(1980, 0, 1)));
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

const UTF8_NAMES = 0x0800;
const VERSION = 20;

// The archive of these entries, in their order, each modified at `modified` (milliseconds since the epoch).
export function zip(entries: readonly ZipEntry[], modified: number): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, VERSION, true);
    l.setUint16(6, UTF8_NAMES, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, entry.bytes.length, true);
    l.setUint32(22, entry.bytes.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, VERSION, true);
    c.setUint16(6, VERSION, true);
    c.setUint16(8, UTF8_NAMES, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, entry.bytes.length, true);
    c.setUint32(24, entry.bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, entry.bytes);
    centrals.push(central);
    offset += local.length + entry.bytes.length;
  }
  const directorySize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// Whether bytes start as a ZIP archive does (a local file header).
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Every entry of an archive by its path, read through its central directory; it throws, naming the problem, on an
// archive it cannot read (no directory, an unknown compression, a size or a CRC-32 that does not match).
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('it is not a ZIP archive');
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0; n -= 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('its central directory is broken');
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + packed);
    const data = method === 0 ? raw : method === 8 ? await inflate(raw) : null;
    if (data === null) throw new Error(`${path} uses a compression this app cannot read`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`${path} is damaged`);
    entries.set(path, data);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}
