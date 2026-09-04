// @ts-check
/**
 * Build a deck from Quire source, or print the agent authoring guide.
 *
 * Usage: node src/cli.js <out.html> <deck.md|deck.quire>
 *
 * This exists so decks can still be built headlessly while the runtime that
 * renders in the browser is being written. It is deliberately thin: all the
 * behaviour lives in deck.js and render.js, which the browser will share.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { parseQuire } from './deck.js';
import { page, readSource } from './render.js';
import { AUTHORING_GUIDE } from './guide.js';
import { unpackQuire } from '../skills/quire/package.js';
import { installEpipeHandler, runCli as runDeckCli } from '../skills/quire/quire-package.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** @returns {string} */
export function loadShell() {
  return readFileSync(join(here, '..', 'skills', 'quire', 'shell.html'), 'utf8');
}

/**
 * @param {string} markdown
 * @param {{embedSource?: boolean, assetMap?: Record<string, string>}} [opts]
 * @returns {string}
 */
export function buildHtml(markdown, opts = {}) {
  const embed = opts.embedSource !== false;
  return page(parseQuire(markdown, { assetMap: opts.assetMap }), loadShell(), embed ? markdown : undefined);
}

const MIME = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/** @param {string} path */
function mimeFor(path) {
  return MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] || 'application/octet-stream';
}

/** @param {Uint8Array} bytes */
function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/** @param {{path: string, bytes: Uint8Array, type: string}[]} assets */
function assetMap(assets) {
  return Object.fromEntries(
    assets.flatMap((asset) => {
      const url = `data:${asset.type || mimeFor(asset.path)};base64,${base64(asset.bytes)}`;
      return [[asset.path, url], [`./${asset.path}`, url]];
    }),
  );
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

/** @param {string[]} args */
function main(args) {
  if (args[0] === 'guide' || args.includes('--guide')) {
    console.log(AUTHORING_GUIDE);
    return;
  }
  if (new Set(['create', 'import', 'validate', 'inspect', 'fit', 'render', 'metadata', 'slides', 'assets']).has(args[0])) {
    try {
      runDeckCli(args);
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }
  const noSource = args.includes('--no-source');
  const [out, src] = args.filter((a) => !a.startsWith('--'));
  if (!out || !src) {
    console.error(
      'usage: node src/cli.js guide | create|import|validate|inspect|fit|render|metadata|slides|assets ... | [--no-source] <out.html> <deck.md|deck.quire>',
    );
    process.exitCode = 2;
    return;
  }
  let markdown;
  /** @type {Record<string, string> | undefined} */
  let assets;
  if (/\.quire$/i.test(src)) {
    const packaged = unpackQuire(new Uint8Array(readFileSync(src)));
    markdown = packaged.markdown;
    assets = assetMap(packaged.assets);
  } else {
    markdown = readFileSync(src, 'utf8');
  }
  const html = buildHtml(markdown, { embedSource: !noSource, assetMap: assets });

  // A deck that cannot give its source back is not self-describing, so verify
  // rather than assume. Costs a string compare per build.
  if (!noSource) {
    const recovered = readSource(html);
    if (recovered !== markdown) {
      console.error('error: embedded source does not round-trip; refusing to write');
      process.exitCode = 1;
      return;
    }
  }

  writeFileSync(out, html);
  const count = (html.match(/<section class="slide/g) || []).length;
  const note = noSource ? '' : ', source embedded';
  console.log(`wrote ${out}  (${count} slides${note})`);
}

if (invokedDirectly) {
  installEpipeHandler();
  main(process.argv.slice(2));
}
