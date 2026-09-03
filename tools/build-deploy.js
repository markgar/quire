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
copyFileSync(join(root, 'manifest.webmanifest'), join(out, 'manifest.webmanifest'));
copyFileSync(join(root, 'quire-icon.svg'), join(out, 'quire-icon.svg'));
copyFileSync(join(root, 'quire-icon-192.png'), join(out, 'quire-icon-192.png'));
copyFileSync(join(root, 'quire-icon-512.png'), join(out, 'quire-icon-512.png'));
copyFileSync(join(root, 'apple-touch-icon.png'), join(out, 'apple-touch-icon.png'));
copyFileSync(join(root, 'service-worker.js'), join(out, 'service-worker.js'));

console.log(`staged ${out}`);
