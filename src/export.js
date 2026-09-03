// @ts-check
/**
 * Export: one HTML file carrying the runtime and source.
 *
 * The app is the better way to read a deck, but it cannot be the only way. A
 * customer, an exec, or an attachment needs a file that opens on its own, so
 * export inlines the runtime, pre-renders the slides, and embeds the Quire source.
 * Pre-rendered slides matter beyond convenience: an export still displays
 * where scripts are blocked, which many document previewers and webmail
 * clients do.
 *
 * This deliberately reuses `page()` and `readSource()` rather than assembling
 * a file from the live document. Cloning the DOM would be smaller — the app
 * already holds the CSS, the runtime and the rendered slides — but it would
 * also carry whatever runtime state happened to be on those nodes: the active
 * slide, an inline scale transform, session-hidden slides, overflow
 * annotations. Each of those is a silent difference between what the author
 * saw and what the recipient opens, and the drop-hint that once bled through
 * every slide is the reminder that this class of bug passes every check that
 * is not looking straight at it.
 *
 * Going through `page()` also means an export is byte-identical to what the
 * CLI produces from the same Quire source, which is a property the conformance
 * suite already pins.
 */

import { parseQuire } from './deck.js';
import { page, readSource } from './render.js';

/**
 * Build a single-file deck runtime and source.
 *
 * Recovers the embedded source and compares before returning, the same check
 * the CLI makes before writing. It costs one string comparison and turns a
 * silent corruption into a refusal.
 *
 * @param {string} markdown
 * @param {string} [assetBase]
 * @returns {string} complete HTML document
 */
export function exportHtml(markdown, assetBase) {
  const shell = window.quireShell;
  if (!shell) {
    throw new Error('This build carries no shell template, so it cannot export.');
  }
  const html = page(parseQuire(markdown, { assetBase }), shell, markdown);
  const recovered = readSource(html);
  if (recovered !== markdown) {
    throw new Error('The exported file does not give its source back; refusing to save it.');
  }
  return html;
}

/**
 * Name the export after the deck rather than the app.
 *
 * `renewal.md` becomes `renewal.html`. A deck opened by drop or by URL still
 * has a name; only a deck with none falls back.
 *
 * @param {string | undefined} deckName
 * @returns {string}
 */
export function exportName(deckName) {
  if (!deckName) return 'deck.html';
  return `${deckName.replace(/\.(md|markdown)$/i, '')}.html`;
}

/**
 * Save a built export to disk.
 *
 * A blob URL and a synthetic click, because the alternative — a save picker —
 * would need a permission the app does not otherwise ask for, on a path where
 * the browser's own download flow already does the right thing.
 *
 * @param {string} filename
 * @param {string} html
 */
export function download(filename, html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some builds; one turn of
  // the event loop is enough for the browser to have taken the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
