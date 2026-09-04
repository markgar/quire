// @ts-check

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { findBrowser } from '../skills/quire/quire-package.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'skills', 'quire', 'quire-package.mjs');
const app = pathToFileURL(join(root, 'quire.html')).href;
const workspace = mkdtempSync(join(tmpdir(), 'quire-parity-'));

/** @param {string[]} args */
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`quire CLI failed: ${args.join(' ')}\n${result.stdout}${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

/** @param {string} deck */
function runFit(deck) {
  const result = spawnSync(process.execPath, [cli, 'fit', deck], { encoding: 'utf8' });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`quire CLI fit failed unexpectedly: ${deck}\n${result.stdout}${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requested = process.argv.slice(2).map((path) => resolve(path));
const inputs = requested.length
  ? requested
  : ['apollo-11.quire', 'titanic.quire', 'solar-system.quire']
      .map((fixture) => join(root, 'test', 'decks', fixture));
const browser = await chromium.launch({
  executablePath: findBrowser(undefined),
  headless: true,
  args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const input of inputs) {
    const label = basename(input);
    const deck = extname(input).toLowerCase() === '.quire'
      ? input
      : join(workspace, `${basename(input, extname(input))}.quire`);
    if (deck !== input) run(['import', input, deck]);
    const cliFit = runFit(deck);
    const bytes = readFileSync(deck).toString('base64');

    await page.goto(app);
    await page.evaluate(
      ({ data, name }) => {
        const binary = atob(data);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: 'application/zip' }));
        window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      },
      { data: bytes, name: basename(deck) },
    );
    let rendered = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      rendered = await page.evaluate((slides) => window.quireFit?.report().length === slides, cliFit.slides);
      if (rendered) break;
      await page.waitForTimeout(100);
    }
    assert(rendered, `${label} did not render in the live viewer`);
    const viewerFit = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images, (image) =>
          typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve(),
        ),
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.quireFit.remeasure();
    });

    const cliReport = JSON.stringify(cliFit.report);
    const viewerReport = JSON.stringify(viewerFit);
    assert(cliReport === viewerReport, `${label} CLI and live viewer fit reports differ:
CLI: ${cliReport}
Viewer: ${viewerReport}`);
  }
  console.log(`PASS  visual parity  ${inputs.length} decks match between CLI and live viewer`);
} catch (error) {
  console.error(`FAIL  visual parity  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  rmSync(workspace, { recursive: true, force: true });
}
