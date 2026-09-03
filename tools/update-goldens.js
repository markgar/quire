// @ts-check

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseQuire } from '../src/deck.js';
import { renderSlides } from '../src/render.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

for (const name of readdirSync(fixtures).filter((file) => file.endsWith('.md')).sort()) {
  const base = name.replace(/\.md$/, '');
  const markdown = readFileSync(join(fixtures, name), 'utf8');
  const spec = parseQuire(markdown);

  writeFileSync(join(fixtures, `${base}.expected.json`), JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(join(fixtures, `${base}.expected.html`), renderSlides(spec));
  console.log(`updated ${base}`);
}
