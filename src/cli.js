// @ts-check
/**
 * Build a deck from Quire source, or print the agent authoring guide.
 *
 * Usage: node src/cli.js <out.html> <deck.md>
 *
 * This exists so decks can still be built headlessly while the runtime that
 * renders in the browser is being written. It is deliberately thin: all the
 * behaviour lives in deck.js and render.js, which the browser will share.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseQuire } from './deck.js';
import { page, readSource } from './render.js';
import { AUTHORING_GUIDE } from './guide.js';

const here = dirname(fileURLToPath(import.meta.url));

/** @returns {string} */
export function loadShell() {
  return readFileSync(join(here, 'shell.html'), 'utf8');
}

/**
 * @param {string} markdown
 * @param {{embedSource?: boolean}} [opts]
 * @returns {string}
 */
export function buildHtml(markdown, opts = {}) {
  const embed = opts.embedSource !== false;
  return page(parseQuire(markdown), loadShell(), embed ? markdown : undefined);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args[0] === 'guide' || args.includes('--guide')) {
    console.log(AUTHORING_GUIDE);
    process.exit(0);
  }
  const noSource = args.includes('--no-source');
  const [out, src] = args.filter((a) => !a.startsWith('--'));
  if (!out || !src) {
    console.error('usage: node src/cli.js guide | [--no-source] <out.html> <deck.md>');
    process.exit(2);
  }
  const markdown = readFileSync(src, 'utf8');
  const html = buildHtml(markdown, { embedSource: !noSource });

  // A deck that cannot give its source back is not self-describing, so verify
  // rather than assume. Costs a string compare per build.
  if (!noSource) {
    const recovered = readSource(html);
    if (recovered !== markdown) {
      console.error('error: embedded source does not round-trip; refusing to write');
      process.exit(1);
    }
  }

  writeFileSync(out, html);
  const count = (html.match(/<section class="slide/g) || []).length;
  const note = noSource ? '' : ', source embedded';
  console.log(`wrote ${out}  (${count} slides${note})`);
}
