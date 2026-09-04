// @ts-check
// Node-only lifecycle for native `.quire` packages.

import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { packQuire, referencedAssetPaths, safeEntryPath, unpackQuire } from './package.js';
import { readQuireSource, sourceWarnings, validateQuireSource } from './source.js';

const MIME = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/** @typedef {{path: string, bytes: Uint8Array, type: string}} NativeAsset */

/** @param {string} path */
export const mimeFor = (path) =>
  MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] || 'application/octet-stream';

/** @param {string} path */
export function requireQuirePath(path) {
  if (!/\.quire$/i.test(path)) throw new Error(`expected a .quire file: ${path}`);
  return resolve(path);
}

/** @param {NativeAsset[]} assets */
export function sortedAssets(assets) {
  return [...assets].sort((left, right) => left.path.localeCompare(right.path));
}

/** @param {Uint8Array} bytes */
function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/** @param {NativeAsset[]} assets */
export function assetMap(assets) {
  return Object.fromEntries(
    assets.flatMap((asset) => {
      const url = `data:${asset.type || mimeFor(asset.path)};base64,${base64(asset.bytes)}`;
      return [[asset.path, url], [`./${asset.path}`, url]];
    }),
  );
}

/** @param {string} source */
export function importedAssets(source) {
  const markdown = readFileSync(source, 'utf8');
  const root = dirname(resolve(source));
  const assets = [...new Set(referencedAssetPaths(markdown))].map((path) => ({
    path,
    bytes: new Uint8Array(readFileSync(join(root, path))),
    type: mimeFor(path),
  }));
  return { markdown, assets };
}

/**
 * @param {string} markdown
 * @param {NativeAsset[]} assets
 * @param {boolean} strict
 */
function deckReport(markdown, assets, strict) {
  const parsed = strict ? validateQuireSource(markdown) : readQuireSource(markdown);
  const byPath = new Map();
  for (const asset of assets) {
    const path = safeEntryPath(asset.path);
    if (byPath.has(path)) throw new Error(`duplicate packaged asset: ${path}`);
    byPath.set(path, asset);
  }
  const references = referencedAssetPaths(markdown);
  const missing = references.filter((path) => !byPath.has(path));
  if (missing.length) throw new Error(`missing packaged asset${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  const unreferenced = [...byPath.keys()].filter((path) => !references.includes(path)).sort();
  return {
    title: parsed.deck.title,
    theme: parsed.deck.theme,
    slides: parsed.deck.slides.length,
    assets: assets.length,
    warnings: [
      ...parsed.warnings,
      ...unreferenced.map((path) => `unreferenced packaged asset: ${path}`),
      ...sourceWarnings(markdown),
    ],
  };
}

/**
 * @param {string} markdown
 * @param {NativeAsset[]} assets
 */
export function validateDeck(markdown, assets) {
  return deckReport(markdown, assets, true);
}

/** @param {string} path */
export function readDeck(path) {
  const file = requireQuirePath(path);
  if (!existsSync(file)) throw new Error(`Quire deck does not exist: ${path}`);
  const packaged = unpackQuire(new Uint8Array(readFileSync(file)));
  const report = deckReport(packaged.markdown, packaged.assets, false);
  return { file, ...packaged, report };
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function sameBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/**
 * @param {{markdown: string, assets: NativeAsset[]}} reopened
 * @param {string} markdown
 * @param {NativeAsset[]} assets
 */
function verifyRoundTrip(reopened, markdown, assets) {
  validateDeck(reopened.markdown, reopened.assets);
  if (reopened.markdown !== markdown) throw new Error('Quire source changed during package round-trip');
  const expected = sortedAssets(assets);
  const actual = sortedAssets(reopened.assets);
  if (
    expected.length !== actual.length ||
    expected.some((asset, index) =>
      asset.path !== actual[index].path ||
      asset.type !== actual[index].type ||
      !sameBytes(asset.bytes, actual[index].bytes))
  ) {
    throw new Error('Quire assets changed during package round-trip');
  }
}

/**
 * @param {string} path
 * @param {string} markdown
 * @param {NativeAsset[]} assets
 */
export function writeDeck(path, markdown, assets) {
  const file = requireQuirePath(path);
  const report = validateDeck(markdown, assets);
  const bytes = packQuire(markdown, sortedAssets(assets));
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    const reopened = unpackQuire(new Uint8Array(readFileSync(temporary)));
    verifyRoundTrip(reopened, markdown, assets);
    renameSync(temporary, file);
    return report;
  } finally {
    rmSync(temporary, { force: true });
  }
}
