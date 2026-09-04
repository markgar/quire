// @ts-check
// Shared by the installed Quire skill, browser viewer, and Node CLI.

import { splitSlides, takeMeta } from './deck.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;

/** @type {Uint32Array | undefined} */
let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[n] = value >>> 0;
  }
  return crcTable;
}

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {string} path */
export function safeEntryPath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe Quire package path: ${path}`);
  }
  return normalized;
}

/** @param {number} size */
function bufferPart(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/**
 * Build a `.quire` ZIP package. Entries use ZIP's stored method: image formats
 * are already compressed, while avoiding base64 makes them about 25% smaller
 * than an equivalent self-contained Markdown file.
 *
 * @param {string} markdown
 * @param {{path: string, bytes: Uint8Array, type?: string}[]} assets
 */
export function packQuire(markdown, assets = []) {
  const paths = new Set(['manifest.json', 'deck.md']);
  for (const asset of assets) {
    const path = safeEntryPath(asset.path);
    if (paths.has(path)) throw new Error(`Duplicate Quire package path: ${path}`);
    paths.add(path);
  }
  const manifest = {
    format: 'quire',
    version: 1,
    entry: 'deck.md',
    assets: Object.fromEntries(assets.map((asset) => [safeEntryPath(asset.path), asset.type || ''])),
  };
  const entries = [
    { path: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { path: 'deck.md', bytes: encoder.encode(markdown) },
    ...assets.map((asset) => ({ ...asset, path: safeEntryPath(asset.path) })),
  ];
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.bytes);
    const local = bufferPart(30 + name.length + entry.bytes.length);
    local.view.setUint32(0, ZIP_LOCAL, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, entry.bytes.length, true);
    local.view.setUint32(22, entry.bytes.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    local.bytes.set(entry.bytes, 30 + name.length);
    localParts.push(local.bytes);

    const central = bufferPart(46 + name.length);
    central.view.setUint32(0, ZIP_CENTRAL, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, entry.bytes.length, true);
    central.view.setUint32(24, entry.bytes.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, localOffset, true);
    central.bytes.set(name, 46);
    centralParts.push(central.bytes);
    localOffset += local.bytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = bufferPart(22);
  end.view.setUint32(0, ZIP_END, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, localOffset, true);

  const total = localOffset + centralSize + end.bytes.length;
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end.bytes]) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** @param {Uint8Array} bytes */
function findEnd(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END) return offset;
  }
  throw new Error('Not a valid Quire package: ZIP directory not found.');
}

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {{markdown: string, assets: {path: string, bytes: Uint8Array, type: string}[]}}
 */
export function unpackQuire(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(bytes);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL) throw new Error('Invalid Quire package directory.');
    const method = view.getUint16(offset + 10, true);
    if (method !== 0) throw new Error('This Quire package uses unsupported ZIP compression.');
    const checksum = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = safeEntryPath(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    if (files.has(path)) throw new Error(`Duplicate Quire package path: ${path}`);
    if (view.getUint32(localOffset, true) !== ZIP_LOCAL) throw new Error('Invalid Quire package entry.');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const content = bytes.slice(start, start + size);
    if (crc32(content) !== checksum) throw new Error(`Corrupt Quire package entry: ${path}`);
    files.set(path, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const markdownBytes = files.get('deck.md');
  const manifestBytes = files.get('manifest.json');
  if (!markdownBytes || !manifestBytes) throw new Error('A Quire package must contain deck.md and manifest.json.');
  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    throw new Error('Invalid Quire package manifest JSON.');
  }
  if (manifest?.format !== 'quire' || manifest?.version !== 1 || manifest?.entry !== 'deck.md') {
    throw new Error('Unsupported Quire package manifest.');
  }
  if (!manifest.assets || typeof manifest.assets !== 'object' || Array.isArray(manifest.assets)) {
    throw new Error('A Quire package manifest must contain an asset map.');
  }
  const assetTypes = manifest.assets;
  for (const path of Object.keys(assetTypes)) {
    const normalized = safeEntryPath(path);
    if (normalized === 'deck.md' || normalized === 'manifest.json' || !files.has(normalized)) {
      throw new Error(`Quire package manifest references a missing asset: ${path}`);
    }
  }
  const assets = [...files.entries()]
    .filter(([path]) => path !== 'deck.md' && path !== 'manifest.json')
    .map(([path, content]) => {
      if (!(path in assetTypes)) throw new Error(`Quire package asset is missing from the manifest: ${path}`);
      return { path, bytes: content, type: String(assetTypes[path] || '') };
    });
  return { markdown: decoder.decode(markdownBytes), assets };
}

/** @param {string} markdown */
export function referencedAssetPaths(markdown) {
  return splitSlides(markdown).chunks
    .map((chunk) => takeMeta(chunk)[0].image)
    .filter((path) => path !== undefined)
    .filter((path) => !/^(?:data:|[a-z][a-z0-9+.-]*:|\/|\/\/)/i.test(path))
    .map(safeEntryPath);
}
