#!/usr/bin/env node
// @ts-check

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseQuire } from './deck.js';
import { page, renderSlide } from './render.js';
import { packQuire, referencedAssetPaths, safeEntryPath, unpackQuire } from './package.js';
import {
  insertSlide,
  listSlides,
  moveSlide,
  parseQuireSource,
  readSlide,
  removeSlide,
  replaceSlide,
  resolveSlide,
  setDocumentMetadata,
  validateQuireSource,
} from './source.js';

const MIME = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function installEpipeHandler() {
  process.stdout.on('error', (error) => {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EPIPE') process.exit(0);
    throw error;
  });
}

/** @param {string} path */
const mimeFor = (path) =>
  MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] || 'application/octet-stream';

/** @param {string} path */
function requireQuirePath(path) {
  if (!/\.quire$/i.test(path)) throw new Error(`expected a .quire file: ${path}`);
  return resolve(path);
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function sameBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** @param {{path: string, bytes: Uint8Array, type: string}[]} assets */
function sortedAssets(assets) {
  return [...assets].sort((left, right) => left.path.localeCompare(right.path));
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

/** @param {string} source */
function importedAssets(source) {
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
 * @param {{path: string, bytes: Uint8Array, type: string}[]} assets
 */
function validateDeck(markdown, assets) {
  const parsed = validateQuireSource(markdown);
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
    warnings: unreferenced.map((path) => `unreferenced packaged asset: ${path}`),
  };
}

/** @param {string} path */
function readDeck(path) {
  const file = requireQuirePath(path);
  if (!existsSync(file)) throw new Error(`Quire deck does not exist: ${path}`);
  const packaged = unpackQuire(new Uint8Array(readFileSync(file)));
  const report = validateDeck(packaged.markdown, packaged.assets);
  return { file, ...packaged, report };
}

/**
 * @param {string} path
 * @param {string} markdown
 * @param {{path: string, bytes: Uint8Array, type: string}[]} assets
 */
function writeDeck(path, markdown, assets) {
  const file = requireQuirePath(path);
  const report = validateDeck(markdown, assets);
  const bytes = packQuire(markdown, sortedAssets(assets));
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    const reopened = unpackQuire(new Uint8Array(readFileSync(temporary)));
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
    renameSync(temporary, file);
    return report;
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** @param {string | undefined} explicit */
function findBrowser(explicit) {
  const configured = explicit || process.env.QUIRE_BROWSER || process.env.CHROME_PATH;
  if (configured) {
    const path = resolve(configured);
    if (!existsSync(path)) throw new Error(`browser executable does not exist: ${configured}`);
    return path;
  }

  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        join(homedir(), 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
        join(homedir(), 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ]
    : process.platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
          .filter(Boolean)
          .flatMap((root) => [
            join(/** @type {string} */ (root), 'Google', 'Chrome', 'Application', 'chrome.exe'),
            join(/** @type {string} */ (root), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            join(/** @type {string} */ (root), 'Chromium', 'Application', 'chrome.exe'),
          ])
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/microsoft-edge',
          '/usr/bin/microsoft-edge-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];

  for (const path of candidates) {
    if (path && existsSync(path)) return path;
  }
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser'];
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const name of names) {
      const path = join(directory, name);
      if (existsSync(path)) return path;
    }
  }
  throw new Error('no Chrome, Edge, or Chromium executable found; set QUIRE_BROWSER to its path');
}

/** @param {string} source */
function inlineBrowserModule(source) {
  return source
    .replace(/^import[^;]*;\s*$/gm, '')
    .replace(/^export (function|const|class)/gm, '$1')
    .replace(/^export \{[^}]*\};\s*$/gm, '')
    .replace(/<\/script/gi, '<\\/script');
}

const FIT_CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; media-src data:; font-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';

/** @param {unknown} value */
function htmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} shell */
function shellCss(shell) {
  const start = shell.indexOf('<style>');
  const end = shell.indexOf('</style>', start);
  if (start < 0 || end < 0) throw new Error('Quire shell does not contain its presentation styles');
  return shell.slice(start + '<style>'.length, end);
}

/**
 * @param {string} browser
 * @param {string[]} args
 * @param {string} workspace
 */
function runBrowser(browser, args, workspace) {
  const common = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-sync',
    '--hide-scrollbars',
    '--incognito',
    '--no-default-browser-check',
    '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--proxy-server=http://127.0.0.1:9',
    '--proxy-bypass-list=<-loopback>',
    ...args,
  ];
  if (process.platform !== 'darwin') common.unshift(`--user-data-dir=${join(workspace, 'profile')}`);
  if (typeof process.getuid === 'function' && process.getuid() === 0) common.unshift('--no-sandbox');
  let result = spawnSync(browser, ['--headless=new', ...common], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30000,
  });
  if (!result.error && result.status !== 0) {
    result = spawnSync(browser, ['--headless', ...common], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30000,
    });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`headless browser exited ${result.status}: ${String(result.stderr || '').trim()}`);
  }
  return result;
}

/**
 * @param {string} markdown
 * @param {{path: string, bytes: Uint8Array, type: string}[]} assets
 */
function fitHtml(markdown, assets) {
  const shell = readFileSync(new URL('./shell.html', import.meta.url), 'utf8');
  const fitSource = inlineBrowserModule(readFileSync(new URL('./fit.js', import.meta.url), 'utf8'));
  const html = page(parseQuire(markdown, { assetMap: assetMap(assets) }), shell).replace(
    '<meta charset="UTF-8">',
    `<meta charset="UTF-8">\n${FIT_CSP}`,
  );
  const runner = `<script>
${fitSource}
(() => {
  const encode = (value) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  try {
    const report = measureDeck(document.getElementById('scaler'));
    document.documentElement.setAttribute('data-quire-fit', encode(report));
  } catch (error) {
    document.documentElement.setAttribute('data-quire-fit-error', encode(String(error && error.message || error)));
  }
})();
</script>`;
  return html.replace('</body>', `${runner}\n</body>`);
}

/**
 * @param {string} path
 * @param {string | undefined} explicitBrowser
 */
function measureDeckFile(path, explicitBrowser) {
  const deck = readDeck(path);
  const browser = findBrowser(explicitBrowser);
  const workspace = mkdtempSync(join(tmpdir(), 'quire-fit-'));
  try {
    const htmlPath = join(workspace, 'deck.html');
    writeFileSync(htmlPath, fitHtml(deck.markdown, deck.assets));
    const result = runBrowser(browser, [
      '--virtual-time-budget=5000',
      '--window-size=1440,900',
      '--dump-dom',
      pathToFileURL(htmlPath).href,
    ], workspace);
    const errorMatch = result.stdout.match(/\sdata-quire-fit-error="([^"]+)"/);
    if (errorMatch) throw new Error(Buffer.from(errorMatch[1], 'base64').toString('utf8'));
    const match = result.stdout.match(/\sdata-quire-fit="([^"]+)"/);
    if (!match) throw new Error('headless browser did not produce a fit report');
    const report = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    const overflowing = report.filter((/** @type {{over: number}} */ slide) => slide.over > 0);
    return { browser, slides: report.length, overflowing: overflowing.length, report };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/**
 * @param {ReturnType<typeof readDeck>} deck
 * @param {{index: number, number: number, title: string}[]} slides
 * @param {number} columns
 */
function contactSheetHtml(deck, slides, columns) {
  const shell = readFileSync(new URL('./shell.html', import.meta.url), 'utf8');
  const spec = parseQuire(deck.markdown, { assetMap: assetMap(deck.assets) });
  const thumbWidth = 320;
  const thumbHeight = 180;
  const labelHeight = 34;
  const gap = 18;
  const padding = 24;
  const width = padding * 2 + columns * thumbWidth + (columns - 1) * gap;
  const rows = Math.ceil(slides.length / columns);
  const height = padding * 2 + rows * (thumbHeight + labelHeight) + Math.max(0, rows - 1) * gap;
  const items = slides.map((slide) => {
    const rendered = renderSlide(spec.slides[slide.index], true).replace(' active"', '"');
    return `<figure class="sheet-item">
  <div class="sheet-slide">${rendered}</div>
  <figcaption>${slide.number}. ${htmlText(slide.title)}</figcaption>
</figure>`;
  }).join('\n');
  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${htmlText(spec.theme || 'light')}">
<head>
<meta charset="UTF-8">
${FIT_CSP}
<style>
${shellCss(shell)}
html, body { width: ${width}px; height: ${height}px; min-height: 0; overflow: hidden; }
body { display: block; padding: ${padding}px; background: var(--q-bg); }
.sheet { display: grid; grid-template-columns: repeat(${columns}, ${thumbWidth}px); gap: ${gap}px; }
.sheet-item { width: ${thumbWidth}px; height: ${thumbHeight + labelHeight}px; margin: 0; }
.sheet-slide { position: relative; width: ${thumbWidth}px; height: ${thumbHeight}px; overflow: hidden; background: var(--q-surface); }
.sheet-slide .slide {
  display: flex !important; position: absolute; inset: 0 auto auto 0;
  width: 1280px; height: 720px; transform: scale(0.25); transform-origin: top left;
  box-shadow: none;
}
.sheet-item figcaption {
  height: ${labelHeight}px; padding: 8px 4px 0; overflow: hidden;
  color: var(--q-text); font: 600 13px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: nowrap; text-overflow: ellipsis;
}
</style>
</head>
<body><main class="sheet">${items}</main></body>
</html>`;
  return { html, width, height };
}

/**
 * @param {ReturnType<typeof readDeck>} deck
 * @param {number} index
 */
function singleSlideHtml(deck, index) {
  const shell = readFileSync(new URL('./shell.html', import.meta.url), 'utf8');
  const spec = parseQuire(deck.markdown, { assetMap: assetMap(deck.assets) });
  const rendered = renderSlide(spec.slides[index], true);
  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${htmlText(spec.theme || 'light')}">
<head>
<meta charset="UTF-8">
${FIT_CSP}
<style>
${shellCss(shell)}
html, body { width: 1280px; height: 720px; min-height: 0; overflow: hidden; }
body { display: block; background: var(--q-bg); }
.slide { display: flex !important; position: absolute; inset: 0; box-shadow: none; }
</style>
</head>
<body>${rendered}</body>
</html>`;
  return { html, width: 1280, height: 720 };
}

/**
 * @param {string} path
 * @param {string} output
 * @param {{browser?: string, columns?: number, selector?: string}} options
 */
function renderDeckFile(path, output, options) {
  if (!/\.png$/i.test(output)) throw new Error(`render output must be a .png file: ${output}`);
  const deck = readDeck(path);
  const browser = findBrowser(options.browser);
  const allSlides = listSlides(deck.markdown).map((slide, index) => ({ ...slide, index }));
  const selection = options.selector ? resolveSlide(deck.markdown, options.selector) : undefined;
  const selected = selection ? [{ ...selection.slide, index: selection.index }] : allSlides;
  const columns = options.columns || 4;
  if (!Number.isInteger(columns) || columns < 1 || columns > 6) {
    throw new Error('render columns must be an integer between 1 and 6');
  }
  const rendered = options.selector
    ? singleSlideHtml(deck, selected[0].index)
    : contactSheetHtml(deck, selected, columns);
  const file = resolve(output);
  mkdirSync(dirname(file), { recursive: true });
  const workspace = mkdtempSync(join(tmpdir(), 'quire-render-'));
  try {
    const htmlPath = join(workspace, 'deck.html');
    writeFileSync(htmlPath, rendered.html);
    runBrowser(browser, [
      '--force-device-scale-factor=1',
      '--virtual-time-budget=5000',
      `--window-size=${rendered.width},${rendered.height}`,
      `--screenshot=${file}`,
      pathToFileURL(htmlPath).href,
    ], workspace);
    if (!existsSync(file)) throw new Error('headless browser did not create the requested PNG');
    const bytes = readFileSync(file);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      rmSync(file, { force: true });
      throw new Error('headless browser produced an invalid PNG');
    }
    return {
      file,
      browser,
      mode: options.selector ? 'slide' : 'contact-sheet',
      slides: selected.length,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** @param {string[]} args @param {string} name */
function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

/** @param {string[]} args @param {string} name */
function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

/** @param {string[]} args */
function slideInput(args) {
  const content = takeOption(args, '--content');
  const from = takeOption(args, '--from');
  const stdin = takeFlag(args, '--stdin');
  const choices = [content !== undefined, from !== undefined, stdin].filter(Boolean).length;
  if (choices !== 1) throw new Error('provide exactly one of --content, --from, or --stdin');
  if (content !== undefined) return content;
  if (from !== undefined) return readFileSync(from, 'utf8');
  return readFileSync(0, 'utf8');
}

/** @param {unknown} value */
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function usage() {
  console.log(`Quire deck CLI

Usage:
  quire-package.mjs create <deck.quire> --title <title> [--theme light|dark]
  quire-package.mjs import <deck.md> <deck.quire>
  quire-package.mjs validate <deck.quire>
  quire-package.mjs inspect <deck.quire>
  quire-package.mjs fit <deck.quire> [--browser <executable>]
  quire-package.mjs render <deck.quire> <output.png> [--slide <number|exact-title>] [--columns 1-6]
  quire-package.mjs metadata get <deck.quire> [key]
  quire-package.mjs metadata set <deck.quire> <key> <value>
  quire-package.mjs metadata remove <deck.quire> <key>
  quire-package.mjs slides list <deck.quire>
  quire-package.mjs slides read <deck.quire> <number|exact-title>
  quire-package.mjs slides insert <deck.quire> <position> (--content <source>|--from <file>|--stdin)
  quire-package.mjs slides replace <deck.quire> <number|exact-title> (--content <source>|--from <file>|--stdin)
  quire-package.mjs slides move <deck.quire> <number|exact-title> <position>
  quire-package.mjs slides remove <deck.quire> <number|exact-title>
  quire-package.mjs assets list <deck.quire>
  quire-package.mjs assets add <deck.quire> <source-file> <package-path>
  quire-package.mjs assets replace <deck.quire> <source-file> <package-path>
  quire-package.mjs assets remove <deck.quire> <package-path>

Every mutation validates and round-trips a temporary package before atomically
replacing the .quire file.`);
}

/** @param {string[]} argv */
export function runCli(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'create') {
    const output = args.shift();
    if (!output) throw new Error('create requires a .quire destination');
    const title = takeOption(args, '--title');
    const theme = takeOption(args, '--theme') || 'light';
    const force = takeFlag(args, '--force');
    if (!title || /[\r\n]/.test(title)) throw new Error('create requires a single-line --title');
    if (!/^(?:light|dark)$/i.test(theme)) throw new Error('theme must be light or dark');
    const file = requireQuirePath(output);
    if (existsSync(file) && !force) throw new Error(`refusing to replace existing deck without --force: ${output}`);
    if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
    const markdown = `---\ntitle: ${title}\ntheme: ${theme.toLowerCase()}\n---\n\n# ${title}\n`;
    const report = writeDeck(file, markdown, []);
    printJson({ file, ...report });
    return;
  }

  if (command === 'import') {
    const source = args.shift();
    const output = args.shift();
    const force = takeFlag(args, '--force');
    if (!source || !output || args.length) {
      throw new Error('import requires <deck.md> <deck.quire> [--force]');
    }
    if (!/\.md$/i.test(source)) throw new Error(`expected a .md source file: ${source}`);
    const file = requireQuirePath(output);
    if (existsSync(file) && !force) throw new Error(`refusing to replace existing deck without --force: ${output}`);
    const imported = importedAssets(source);
    const report = writeDeck(file, imported.markdown, imported.assets);
    printJson({ file, imported: resolve(source), ...report });
    return;
  }

  if (command === 'validate' || command === 'inspect') {
    const path = args.shift();
    if (!path || args.length) throw new Error(`${command} requires exactly one .quire file`);
    const deck = readDeck(path);
    if (command === 'validate') {
      printJson({ file: deck.file, valid: true, ...deck.report });
    } else {
      const source = parseQuireSource(deck.markdown);
      printJson({
        file: deck.file,
        metadata: source.metadata,
        slides: listSlides(deck.markdown),
        assets: sortedAssets(deck.assets).map((asset) => ({
          path: asset.path,
          type: asset.type,
          bytes: asset.bytes.length,
        })),
        warnings: deck.report.warnings,
      });
    }
    return;
  }

  if (command === 'fit') {
    const path = args.shift();
    const browser = takeOption(args, '--browser');
    if (!path || args.length) throw new Error('fit requires one .quire file and optional --browser');
    const report = measureDeckFile(path, browser);
    printJson(report);
    if (report.overflowing) {
      throw new Error(`${report.overflowing} slide${report.overflowing === 1 ? '' : 's'} overflow the 720px canvas`);
    }
    return;
  }

  if (command === 'render') {
    const path = args.shift();
    const output = args.shift();
    const selector = takeOption(args, '--slide');
    const browser = takeOption(args, '--browser');
    const columnsOption = takeOption(args, '--columns');
    if (!path || !output || args.length) {
      throw new Error('render requires <deck.quire> <output.png> and optional --slide, --columns, or --browser');
    }
    const report = renderDeckFile(path, output, {
      browser,
      selector,
      columns: columnsOption === undefined ? undefined : Number(columnsOption),
    });
    printJson(report);
    return;
  }

  if (command === 'metadata') {
    const action = args.shift();
    const path = args.shift();
    if (!action || !path) throw new Error('metadata requires an action and .quire file');
    const deck = readDeck(path);
    if (action === 'get') {
      const key = args.shift();
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      const metadata = parseQuireSource(deck.markdown).metadata;
      if (key) {
        const found = Object.entries(metadata).find(([name]) => name.toLowerCase() === key.toLowerCase());
        if (!found) throw new Error(`document metadata does not contain ${key}`);
        console.log(found[1]);
      } else {
        printJson(metadata);
      }
      return;
    }
    const key = args.shift();
    if (!key) throw new Error(`metadata ${action} requires a key`);
    let markdown;
    if (action === 'set') {
      const value = args.shift();
      if (value === undefined || args.length) throw new Error('metadata set requires exactly one value');
      markdown = setDocumentMetadata(deck.markdown, key, value);
    } else if (action === 'remove') {
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      markdown = setDocumentMetadata(deck.markdown, key, undefined);
    } else {
      throw new Error(`unknown metadata action: ${action}`);
    }
    printJson({ file: deck.file, ...writeDeck(deck.file, markdown, deck.assets) });
    return;
  }

  if (command === 'slides') {
    const action = args.shift();
    const path = args.shift();
    if (!action || !path) throw new Error('slides requires an action and .quire file');
    const deck = readDeck(path);
    if (action === 'list') {
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      printJson(listSlides(deck.markdown));
      return;
    }
    const selector = args.shift();
    if (!selector) throw new Error(`slides ${action} requires a slide selector or position`);
    if (action === 'read') {
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      process.stdout.write(readSlide(deck.markdown, selector));
      return;
    }
    let markdown;
    if (action === 'insert') {
      const fragment = slideInput(args);
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      markdown = insertSlide(deck.markdown, Number(selector), fragment);
    } else if (action === 'replace') {
      const fragment = slideInput(args);
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      markdown = replaceSlide(deck.markdown, selector, fragment);
    } else if (action === 'move') {
      const position = args.shift();
      if (!position || args.length) throw new Error('slides move requires one destination position');
      markdown = moveSlide(deck.markdown, selector, Number(position));
    } else if (action === 'remove') {
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      markdown = removeSlide(deck.markdown, selector);
    } else {
      throw new Error(`unknown slides action: ${action}`);
    }
    printJson({ file: deck.file, ...writeDeck(deck.file, markdown, deck.assets) });
    return;
  }

  if (command === 'assets') {
    const action = args.shift();
    const path = args.shift();
    if (!action || !path) throw new Error('assets requires an action and .quire file');
    const deck = readDeck(path);
    if (action === 'list') {
      if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
      printJson(sortedAssets(deck.assets).map((asset) => ({
        path: asset.path,
        type: asset.type,
        bytes: asset.bytes.length,
      })));
      return;
    }
    const source = action === 'add' || action === 'replace' ? args.shift() : undefined;
    const packagePath = safeEntryPath(args.shift() || '');
    if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
    const index = deck.assets.findIndex((asset) => asset.path === packagePath);
    if (action === 'add') {
      if (!source) throw new Error('assets add requires a source file and package path');
      if (index >= 0) throw new Error(`packaged asset already exists: ${packagePath}`);
      deck.assets.push({
        path: packagePath,
        bytes: new Uint8Array(readFileSync(source)),
        type: mimeFor(packagePath),
      });
    } else if (action === 'replace') {
      if (!source) throw new Error('assets replace requires a source file and package path');
      if (index < 0) throw new Error(`packaged asset does not exist: ${packagePath}`);
      deck.assets[index] = {
        path: packagePath,
        bytes: new Uint8Array(readFileSync(source)),
        type: mimeFor(packagePath),
      };
    } else if (action === 'remove') {
      if (index < 0) throw new Error(`packaged asset does not exist: ${packagePath}`);
      if (referencedAssetPaths(deck.markdown).includes(packagePath)) {
        throw new Error(`cannot remove referenced asset: ${packagePath}`);
      }
      deck.assets.splice(index, 1);
    } else {
      throw new Error(`unknown assets action: ${action}`);
    }
    printJson({ file: deck.file, ...writeDeck(deck.file, deck.markdown, deck.assets) });
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

const invokedDirectly =
  process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (invokedDirectly) {
  installEpipeHandler();
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
