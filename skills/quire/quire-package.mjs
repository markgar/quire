#!/usr/bin/env node
// @ts-check

import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packQuire, referencedAssetPaths, safeEntryPath, unpackQuire } from './package.js';
import {
  insertSlide,
  listSlides,
  moveSlide,
  parseQuireSource,
  readSlide,
  removeSlide,
  replaceSlide,
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

/** @param {string} path */
const mimeFor = (path) =>
  MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] || 'application/octet-stream';

/** @param {unknown} value */
const fail = (value) => {
  throw value instanceof Error ? value : new Error(String(value));
};

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
  quire-package.mjs validate <deck.quire>
  quire-package.mjs inspect <deck.quire>
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
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
