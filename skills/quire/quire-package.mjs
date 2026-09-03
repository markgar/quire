#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { packQuire, referencedAssetPaths, unpackQuire } from './package.js';

const MIME = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const mimeFor = (path) => MIME[extname(path).toLowerCase()] || 'application/octet-stream';
const [command, source, destination] = process.argv.slice(2);

if (command === 'pack' && source && destination) {
  const markdown = readFileSync(source, 'utf8');
  const root = dirname(source);
  const assets = referencedAssetPaths(markdown).map((path) => ({
    path,
    bytes: new Uint8Array(readFileSync(join(root, path))),
    type: mimeFor(path),
  }));
  writeFileSync(destination, packQuire(markdown, assets));
  console.log(`wrote ${destination}  (${assets.length} assets)`);
} else if (command === 'unpack' && source && destination) {
  const packaged = unpackQuire(new Uint8Array(readFileSync(source)));
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'deck.md'), packaged.markdown);
  for (const asset of packaged.assets) {
    const target = join(destination, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, asset.bytes);
  }
  console.log(`wrote ${destination}  (${packaged.assets.length} assets)`);
} else {
  console.error('usage: node quire-package.mjs pack <deck.md> <deck.quire>');
  console.error('   or: node quire-package.mjs unpack <deck.quire> <directory>');
  process.exitCode = 2;
}
