// @ts-check

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assetMap,
  importedAssets,
  mimeFor,
  readDeck,
  requireQuirePath,
  validateDeck,
  writeDeck,
} from '../skills/quire/native.js';

const workspace = mkdtempSync(join(tmpdir(), 'quire-native-package-'));
const deckPath = join(workspace, 'deck.quire');

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {() => unknown} action @param {string} expected */
function assertThrows(action, expected) {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expected), `expected error containing "${expected}"`);
    return;
  }
  throw new Error(`expected error containing "${expected}"`);
}

try {
  const markdown = [
    '---',
    'title: Native boundary',
    'theme: dark',
    '---',
    '',
    'image: ./images/pixel.png',
    '',
    '# Native boundary',
    '',
  ].join('\n');
  const pixel = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const assets = [{ path: 'images/pixel.png', bytes: pixel, type: mimeFor('pixel.PNG') }];

  const report = writeDeck(deckPath, markdown, assets);
  assert(report.slides === 1 && report.assets === 1 && report.warnings.length === 0, 'write report was incorrect');

  const deck = readDeck(deckPath);
  assert(deck.markdown === markdown, 'native source did not round-trip exactly');
  assert(deck.assets[0].bytes.every((byte, index) => byte === pixel[index]), 'native asset bytes changed');
  assert(
    assetMap(deck.assets)['./images/pixel.png'] === 'data:image/png;base64,iVBORw0KGgo=',
    'native asset map did not preserve the package MIME type and bytes',
  );

  const original = readFileSync(deckPath);
  const invalid = 'layout: title\n\n# Invalid\n\n> A title slide cannot render this closer.\n';
  assertThrows(() => writeDeck(deckPath, invalid, assets), 'title layout cannot render quote content');
  assert(original.equals(readFileSync(deckPath)), 'semantic validation failure changed the original package');

  assertThrows(() => writeDeck(deckPath, markdown, []), 'missing packaged asset');
  assert(original.equals(readFileSync(deckPath)), 'asset validation failure changed the original package');
  assert(
    readdirSync(workspace).every((name) => !name.endsWith('.tmp')),
    'a rejected native write left a temporary package behind',
  );

  const importSource = join(workspace, 'import.md');
  const importImage = join(workspace, 'pixel.png');
  writeFileSync(importSource, 'image: ./pixel.png\n\n# Imported\n');
  writeFileSync(importImage, pixel);
  const imported = importedAssets(importSource);
  assert(imported.assets.length === 1 && imported.assets[0].type === 'image/png', 'import did not collect its image');

  assertThrows(() => validateDeck(markdown, [...assets, ...assets]), 'duplicate packaged asset');
  assertThrows(() => requireQuirePath(join(workspace, 'deck.md')), 'expected a .quire file');

  console.log('PASS  native package  validation, import, round-trip, asset mapping, and rollback');
} catch (error) {
  console.error(`FAIL  native package  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
