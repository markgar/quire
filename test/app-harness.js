// @ts-check

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findBrowser } from '../skills/quire/quire-package.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
/** @typedef {{ name: string, pass: boolean, detail: string }} HarnessEntry */
/** @typedef {{ passed: number, failed: number, results: HarnessEntry[] }} HarnessResult */
const server = spawn(process.execPath, [join(root, 'tools', 'serve.js'), '--port', '0'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

/** @type {string[]} */
const serverErrors = [];
server.stderr.setEncoding('utf8');
server.stderr.on('data', (chunk) => serverErrors.push(chunk));

const serverUrl = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('timed out starting the app harness server')), 5000);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(
    `app harness server exited with code ${code}\n${serverErrors.join('')}`,
  )));
  server.stdout.setEncoding('utf8');
  server.stdout.on('data', (chunk) => {
    const match = /quire dev server: (http:\/\/localhost:\d+)/.exec(chunk);
    if (!match) return;
    clearTimeout(timeout);
    resolve(match[1]);
  });
});

/** @type {import('playwright-core').Browser | undefined} */
let browser;
try {
  browser = await chromium.launch({
    executablePath: findBrowser(undefined),
    headless: true,
    args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
  });
  const page = await browser.newPage();
  await page.goto(`${serverUrl}/test/app-harness.html`);
  await page.waitForFunction(() => /** @type {any} */ (window).__harness?.done, null, {
    timeout: 120_000,
  });
  const result = /** @type {HarnessResult} */ (
    await page.evaluate(() => /** @type {any} */ (window).__harness)
  );
  if (result.failed) {
    for (const failure of result.results.filter((entry) => !entry.pass)) {
      console.error(`FAIL  app harness  ${failure.name}: ${failure.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`PASS  app harness  ${result.passed} browser checks passed`);
  }
} finally {
  await browser?.close();
  server.kill();
}
