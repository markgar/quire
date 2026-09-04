// @ts-check
/**
 * Read browser-selected Quire decks without sending their contents anywhere.
 *
 * Native `.quire` packages carry their referenced assets in the ZIP. The
 * browser renderer consumes URLs, so package bytes become local data URLs while
 * the authored paths remain unchanged.
 */

import { unpackQuire } from '../skills/quire/package.js';

/** @param {File} file */
function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** @param {{path: string, bytes: Uint8Array, type: string}[]} assets */
async function packageAssetMap(assets) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const asset of assets) {
    const copy = new Uint8Array(asset.bytes.length);
    copy.set(asset.bytes);
    const url = await fileDataUrl(new File([copy.buffer], asset.path, { type: asset.type }));
    map[asset.path] = url;
    map[`./${asset.path}`] = url;
  }
  return map;
}

/**
 * @param {File} file
 * @returns {Promise<{markdown: string, assets: Record<string, string>}>}
 */
async function readDeckFile(file) {
  if (!/\.quire$/i.test(file.name)) throw new Error(`expected a .quire file: ${file.name}`);
  const packaged = unpackQuire(await file.arrayBuffer());
  return { markdown: packaged.markdown, assets: await packageAssetMap(packaged.assets) };
}

export { readDeckFile };
