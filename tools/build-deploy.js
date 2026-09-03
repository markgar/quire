// @ts-check

import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
copyFileSync(join(root, 'quire.html'), join(out, 'index.html'));
copyFileSync(join(root, 'staticwebapp.config.json'), join(out, 'staticwebapp.config.json'));

console.log(`staged ${out}`);
