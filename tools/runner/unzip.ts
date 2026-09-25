// The files inside a ZIP archive the editor handed out, read the way any unzip tool reads them (APPNOTE 6.3: the
// end of central directory, each central directory entry, its local header and data, stored or deflated), with
// every entry's size and CRC-32 checked. The scenario runner's export terminal reads downloads through it. It is
// written apart from the editor's own writer (src/core/project/zip.ts), so a wrong writer cannot pass its own test.
import zlib from 'node:zlib';

export function unzip(bytes: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a ZIP archive: it has no end of central directory');
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n += 1) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error(`entry ${n}: no central directory header at ${at}`);
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const packed = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: no local header at ${local}`);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method} is not stored (0) or deflated (8)`);
    if (data.length !== size) throw new Error(`${name}: ${data.length} bytes, the directory says ${size}`);
    if (zlib.crc32(data) !== crc) throw new Error(`${name}: its CRC-32 does not match the directory's`);
    files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
