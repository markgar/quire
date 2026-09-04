// @ts-check

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseQuire } from '../src/deck.js';
import { renderSlides } from '../src/render.js';
import { mimeFor } from '../skills/quire/native.js';
import { packQuire, referencedAssetPaths } from '../skills/quire/package.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

for (const name of readdirSync(fixtures).filter((file) => file.endsWith('.md')).sort()) {
  const base = name.replace(/\.md$/, '');
  const markdown = readFileSync(join(fixtures, name), 'utf8');
  const spec = parseQuire(markdown);
  const assets = [...new Set(referencedAssetPaths(markdown))].map((path) => ({
    path,
    bytes: new Uint8Array(readFileSync(join(fixtures, path))),
    type: mimeFor(path),
  }));

  writeFileSync(join(fixtures, `${base}.expected.json`), JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(join(fixtures, `${base}.expected.html`), renderSlides(spec));
  writeFileSync(join(fixtures, `${base}.quire`), packQuire(markdown, assets));
  console.log(`updated ${base}`);
}
