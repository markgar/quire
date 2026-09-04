// @ts-check
/**
 * A static server for the repo, so the app can be reached over http.
 *
 * Two reasons this exists rather than opening quire.html from disk:
 *
 * - The File System Access API requires a secure context. `localhost` counts
 *   as one; `file://` does not. Without a server the picker, stored handles
 *   and permission re-grant cannot be exercised at all.
 * - Playwright refuses to navigate to `file:`.
 *
 * Usage:
 *   node tools/serve.js [--port 8931] [--root .]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
/** @param {string} flag @param {string} fallback */
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const port = Number(arg('--port', '8931'));
const root = resolve(arg('--root', join(here, '..')));

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'quire.html';

  // normalize collapses `..`; the prefix check then keeps requests inside root.
  const path = join(root, normalize(rel));
  if (!path.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] || 'application/octet-stream',
      'content-length': String(info.size),
      'last-modified': info.mtime.toUTCString(),
      // Everything here is edited while it is being watched. A cached deck or
      // a cached app would make live reload look broken.
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(path);
    // stat succeeding does not mean the read will. An editor's atomic save
    // unlinks and replaces the file between the two, and this server exists to
    // serve files that are being edited. An 'error' event with no listener is
    // thrown as an uncaught exception and takes the process down mid-session.
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`not found: ${rel}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : port;
  console.log(`quire dev server: http://localhost:${activePort}/quire.html`);
  console.log(`serving ${root}`);
});
